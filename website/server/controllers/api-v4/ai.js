import Anthropic from '@anthropic-ai/sdk';
import { authWithHeaders } from '../../middlewares/auth';
import * as Tasks from '../../models/task';
import {
  NotFound,
  NotAuthorized,
  BadRequest,
  TooManyRequests,
} from '../../libs/errors';
import { isAiEnabled, AiResponseError } from '../../libs/ai/client';
import { consumeAiQuota } from '../../libs/ai/rateLimit';
import { estimateTask } from '../../libs/ai/estimate';
import logger from '../../libs/logger';
import { apiError } from '../../libs/apiError';

const api = {};

const AI_TASK_TYPES = ['todo', 'daily'];
const REFERENCE_TASKS_LIMIT = 10;

// Loads a task the user owns and may use AI on. v1 covers personal
// todos and dailies only; challenge and group tasks are excluded.
async function loadAiTask (req, res) {
  if (!isAiEnabled()) throw new NotFound(res.t('aiNotEnabled'));

  const { user } = res.locals;
  if (!user.preferences.ai || !user.preferences.ai.enabled) {
    throw new NotAuthorized(res.t('aiNotEnabledForUser'));
  }

  req.checkParams('taskId', apiError('taskIdRequired')).notEmpty();
  const validationErrors = req.validationErrors();
  if (validationErrors) throw validationErrors;

  const task = await Tasks.Task.findByIdOrAlias(req.params.taskId, user._id);
  if (!task) throw new NotFound(res.t('messageTaskNotFound'));

  const isPersonal = task.userId === user._id
    && !(task.group && task.group.id)
    && !(task.challenge && task.challenge.id);
  if (!isPersonal || AI_TASK_TYPES.indexOf(task.type) === -1) {
    throw new BadRequest(res.t('aiTaskNotSupported'));
  }

  if (!await consumeAiQuota(user._id)) {
    throw new TooManyRequests(res.t('aiTooManyRequests'));
  }

  return task;
}

function handleAiError (err, res) {
  if (err instanceof AiResponseError || err instanceof Anthropic.APIError) {
    logger.error(err, { extraMessage: 'AI request failed', reason: err.reason || err.status });
    throw new BadRequest(res.t('aiRequestFailed'));
  }
  throw err;
}

/**
 * @apiIgnore
 * @api {post} /api/v4/ai/tasks/:taskId/estimate Ask the AI for a time estimate
 * @apiName AiEstimateTask
 * @apiGroup AI
 * @apiDescription Returns a suggested time estimate for one of the user's own
 * todos or dailies. Nothing is saved: the client stores the estimate on the
 * task (via PUT /tasks/:taskId) only if the user accepts it.
 *
 * @apiParam (Path) {String} taskId The task _id or alias
 *
 * @apiSuccess {Object} data.estimate
 * @apiSuccess {Number} data.estimate.minutes Best estimate
 * @apiSuccess {Number} data.estimate.low Optimistic estimate
 * @apiSuccess {Number} data.estimate.high Pessimistic estimate
 * @apiSuccess {Number} data.estimate.confidence 0 to 1
 * @apiSuccess {String} data.estimate.rationale One sentence explanation
 * @apiSuccess {Object[]} data.estimate.checklist Per checklist item estimates ({id, minutes})
 */
api.estimateTask = {
  method: 'POST',
  url: '/ai/tasks/:taskId/estimate',
  middlewares: [authWithHeaders()],
  async handler (req, res) {
    const { user } = res.locals;
    const task = await loadAiTask(req, res);

    // Tasks the user estimated themselves calibrate the AI to their pace
    const referenceTasks = await Tasks.Task.find({
      userId: user._id,
      _id: { $ne: task._id },
      type: { $in: AI_TASK_TYPES },
      'estimate.source': 'user',
      'estimate.minutes': { $gt: 0 },
    })
      .select('text priority estimate')
      .sort({ updatedAt: -1 })
      .limit(REFERENCE_TASKS_LIMIT)
      .lean()
      .exec();

    let result;
    try {
      result = await estimateTask(task, referenceTasks);
    } catch (err) {
      handleAiError(err, res);
    }

    if (!result.estimate) throw new BadRequest(res.t('aiRequestFailed'));

    logger.info('AI estimate', {
      userId: user._id,
      inputTokens: result.usage && result.usage.input_tokens,
      outputTokens: result.usage && result.usage.output_tokens,
    });

    res.respond(200, { estimate: result.estimate });
  },
};

export default api;
