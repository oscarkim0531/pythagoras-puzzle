const FOLDER_ID = '10Flk0SE0m5Xaa3ynOLxzTlP6n3DA7l2T';
const ALLOWED_ORIGIN = 'https://oscarkim0531.github.io';
const MAX_PNG_BYTES = 5 * 1024 * 1024;

function doPost(e) {
  const params = e && e.parameter ? e.parameter : {};
  const requestId = /^[0-9a-f-]{36}$/i.test(params.requestId || '') ? params.requestId : '';
  const result = { type: 'pythagoras-upload', requestId, ok: false };
  try {
    if (params.origin !== ALLOWED_ORIGIN) throw new Error('허용되지 않은 사이트에서 제출했습니다.');
    if (!requestId) throw new Error('제출 요청이 올바르지 않습니다.');
    const studentNumber = String(params.studentNumber || '').trim();
    const puzzleNumber = Number(params.puzzleNumber);
    if (!/^[0-9]{1,12}$/.test(studentNumber)) throw new Error('학번은 숫자만 입력해 주세요.');
    if (!Number.isInteger(puzzleNumber) || puzzleNumber < 1 || puzzleNumber > 9) throw new Error('퍼즐 번호가 올바르지 않습니다.');
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(params.payload || '');
    if (!match || match[1].length > Math.ceil(MAX_PNG_BYTES * 4 / 3) + 4) throw new Error('퍼즐 이미지가 올바르지 않거나 너무 큽니다.');
    const bytes = Utilities.base64Decode(match[1]);
    if (bytes.length > MAX_PNG_BYTES || bytes.length < 8 || (bytes[0] & 255) !== 137 || (bytes[1] & 255) !== 80 || (bytes[2] & 255) !== 78 || (bytes[3] & 255) !== 71) {
      throw new Error('PNG 이미지만 제출할 수 있습니다.');
    }
    const fileName = studentNumber + '_' + puzzleNumber + '.png';
    const boundary = 'puzzle_' + requestId.replace(/-/g, '');
    const metadata = JSON.stringify({ name: fileName, mimeType: 'image/png', parents: [FOLDER_ID] });
    const prefix = Utilities.newBlob('--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + metadata +
      '\r\n--' + boundary + '\r\nContent-Type: image/png\r\n\r\n').getBytes();
    const suffix = Utilities.newBlob('\r\n--' + boundary + '--').getBytes();
    const response = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
      method: 'post',
      contentType: 'multipart/related; boundary=' + boundary,
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      payload: prefix.concat(bytes, suffix),
      muteHttpExceptions: true,
    });
    if (response.getResponseCode() !== 200) throw new Error('드라이브 저장에 실패했습니다. 관리자에게 알려 주세요.');
    const file = JSON.parse(response.getContentText());
    result.ok = true;
    result.name = file.name;
  } catch (error) {
    result.error = error.message || '드라이브에 저장하지 못했습니다.';
  }
  // The upload form targets a popup. Report its result to the opening page
  // without exposing the Drive OAuth token to the browser.
  const safeJson = JSON.stringify(result).replace(/</g, String.fromCharCode(92) + 'u003c');
  return HtmlService.createHtmlOutput(
    '<!doctype html><html><meta charset="utf-8"><body><pre>' + safeJson + '</pre><script>' +
    'var response=' + safeJson + ';' +
    'if(window.top.opener){window.top.opener.postMessage(response,' + JSON.stringify(ALLOWED_ORIGIN) + ');}' +
    'else{window.top.postMessage(response,' + JSON.stringify(ALLOWED_ORIGIN) + ');}' +
    '</script></body></html>'
  );
}
