const https = require('https');
const fs = require('fs');

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (response) => {
      response.pipe(file);
      file.on('finish', () => { file.close(resolve); });
    }).on('error', (err) => { fs.unlink(dest, () => reject(err)); });
  });
}

Promise.all([
  download('https://img.icons8.com/ios-filled/96/999999/grid.png', 'static/tabbar/scenes2.png'),
  download('https://img.icons8.com/ios-filled/96/000000/grid.png', 'static/tabbar/scenes-active2.png')
]).then(() => console.log('Downloaded icons')).catch(console.error);
