/**
 * Yordamchi uyqu (sleep / delay) funksiyasi
 * @param {number} ms - Millisekundlar
 * @returns {Promise<void>}
 */
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default sleep;
