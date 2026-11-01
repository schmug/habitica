import axios from 'axios';

// Returns a suggested estimate for a saved task; nothing is stored server side
export async function estimateTask (store, { taskId }) {
  const response = await axios.post(`/api/v4/ai/tasks/${taskId}/estimate`);
  return response.data.data.estimate;
}
