/**
 * HTTP yordamchi funksiyalari (JSON jo'natish va so'rov tanasini o'qish)
 */

/**
 * Javobni JSON formatida qaytaradi
 * @param {import("node:http").ServerResponse} res
 * @param {number} statusCode
 * @param {object} data
 * @param {object} extraHeaders
 */
export function sendJson(res, statusCode, data, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache, no-store, must-revalidate",
    ...extraHeaders,
  });
  res.end(JSON.stringify(data, null, 2));
}

/**
 * Katta so'rovlardan himoyalangan holda request body'ni JSON qilib o'qiydi
 * @param {import("node:http").IncomingMessage} req
 * @returns {Promise<any>}
 */
export function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error("So'rov hajmi juda katta (maksimal 1MB)"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", reject);
  });
}

export default {
  sendJson,
  readBody,
};
