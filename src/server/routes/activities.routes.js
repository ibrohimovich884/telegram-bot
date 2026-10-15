import { sendJson } from "../../utils/http.js";
import { getActivities } from "../../services/activity.service.js";

/**
 * GET /api/activities -> Bot hodisalari va faoliyat jurnali
 * @param {import("node:http").IncomingMessage} req
 * @param {import("node:http").ServerResponse} res
 */
export function handleActivitiesRoute(req, res) {
  if (req.method === "GET") {
    const activities = getActivities();
    sendJson(res, 200, {
      count: activities.length,
      activities,
    });
    return true;
  }
  return false;
}

export default handleActivitiesRoute;
