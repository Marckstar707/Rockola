const fs = require('fs');
const path = require('path');

const SUPPORTED_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.mp4', '.webm', '.avi', '.mov']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.avi', '.mov']);

async function listMediaFiles(folderPath) {
  const files = await fs.promises.readdir(folderPath);
  return files
    .filter(file => SUPPORTED_EXTENSIONS.has(path.extname(file).toLowerCase()))
    .map(file => {
      const ext = path.extname(file).toLowerCase();
      const type = VIDEO_EXTENSIONS.has(ext) ? 'video' : 'audio';
      return {
        title: file,
        absPath: path.join(folderPath, file),
        type
      };
    });
}

module.exports = {
  listMediaFiles
};
