import nconf from 'nconf';
import {
  buildEstimateMessages,
  normalizeEstimate,
  estimateTask,
  ESTIMATE_SCHEMA,
  MAX_ESTIMATE_MINUTES,
} from '../../../../../website/server/libs/ai/estimate';
import {
  setAiClient,
  isAiEnabled,
  AiResponseError,
} from '../../../../../website/server/libs/ai/client';

const checklistTask = {
  type: 'todo',
  text: 'Write quarterly report',
  notes: 'Include budget numbers',
  priority: 1.5,
  checklist: [
    { id: 'item-1', text: 'Gather numbers', completed: false },
    { id: 'item-2', text: 'Draft summary', completed: true },
  ],
};

function fakeClient (response) {
  const calls = [];
  return {
    calls,
    messages: {
      async create (params) {
        calls.push(params);
        return response;
      },
    },
  };
}

describe('AI time estimation', () => {
  afterEach(() => {
    setAiClient(null);
    sandbox.restore();
  });

  describe('isAiEnabled', () => {
    it('is false without an API key', () => {
      sandbox.stub(nconf, 'get').callsFake(key => (key === 'AI_ENABLED' ? 'true' : undefined));
      expect(isAiEnabled()).to.equal(false);
    });

    it('is true with the flag and a key', () => {
      sandbox.stub(nconf, 'get').callsFake(key => ({ AI_ENABLED: 'true', ANTHROPIC_API_KEY: 'key' })[key]);
      expect(isAiEnabled()).to.equal(true);
    });
  });

  describe('buildEstimateMessages', () => {
    it('includes the task, its difficulty and checklist ids', () => {
      const [message] = buildEstimateMessages(checklistTask);
      expect(message.role).to.equal('user');
      expect(message.content).to.contain('Title: Write quarterly report');
      expect(message.content).to.contain('Difficulty: medium');
      expect(message.content).to.contain('[id: item-1] Gather numbers');
      expect(message.content).to.contain('(already done)');
      expect(message.content).to.not.contain('<reference_tasks>');
    });

    it('adds reference tasks that have estimates', () => {
      const [message] = buildEstimateMessages(checklistTask, [
        { text: 'Email Bob', priority: 1, estimate: { minutes: 10 } },
        { text: 'No estimate', priority: 1, estimate: {} },
      ]);
      expect(message.content).to.contain('<reference_tasks>');
      expect(message.content).to.contain('"Email Bob" (easy): 10 min');
      expect(message.content).to.not.contain('No estimate');
    });
  });

  describe('normalizeEstimate', () => {
    it('returns null without a usable minutes value', () => {
      expect(normalizeEstimate({ minutes: 'abc' }, checklistTask)).to.equal(null);
      expect(normalizeEstimate(null, checklistTask)).to.equal(null);
    });

    it('clamps values and keeps the range around the estimate', () => {
      const result = normalizeEstimate({
        minutes: 30, low: 45, high: 99999, confidence: 3, rationale: 'ok', checklist: [],
      }, checklistTask);
      expect(result.minutes).to.equal(30);
      expect(result.low).to.equal(30);
      expect(result.high).to.equal(MAX_ESTIMATE_MINUTES);
      expect(result.confidence).to.equal(1);
    });

    it('drops checklist estimates for unknown items', () => {
      const result = normalizeEstimate({
        minutes: 30,
        low: 20,
        high: 40,
        confidence: 0.7,
        rationale: 'ok',
        checklist: [{ id: 'item-1', minutes: 20 }, { id: 'unknown', minutes: 5 }],
      }, checklistTask);
      expect(result.checklist).to.eql([{ id: 'item-1', minutes: 20 }]);
    });
  });

  describe('estimateTask', () => {
    it('requests structured output and returns the normalized estimate', async () => {
      const client = fakeClient({
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 20 },
        content: [{
          type: 'text',
          text: JSON.stringify({
            minutes: 45, low: 30, high: 60, confidence: 0.6, rationale: 'Medium report.', checklist: [],
          }),
        }],
      });
      setAiClient(client);

      const { estimate } = await estimateTask(checklistTask, []);
      expect(estimate.minutes).to.equal(45);
      expect(client.calls[0].output_config.format).to.eql({ type: 'json_schema', schema: ESTIMATE_SCHEMA });
      expect(client.calls[0].model).to.be.a('string');
    });

    it('throws an AiResponseError on refusal', async () => {
      setAiClient(fakeClient({ stop_reason: 'refusal', content: [] }));
      await expect(estimateTask(checklistTask, [])).to.eventually.be.rejectedWith(AiResponseError);
    });

    it('throws an AiResponseError on invalid JSON', async () => {
      setAiClient(fakeClient({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'not json' }] }));
      await expect(estimateTask(checklistTask, [])).to.eventually.be.rejectedWith(AiResponseError);
    });
  });
});
