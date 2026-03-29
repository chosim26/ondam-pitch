// ===== 온담 전화서비스 신청 폼 → Google Sheets + 알림 =====
//
// 설정 방법:
// 1. Google Sheets 새로 만들기 (시트 이름: "신청")
// 2. 확장 프로그램 → Apps Script
// 3. 이 코드 전체 복사 → 붙여넣기
// 4. ▶ 함수 선택 드롭다운에서 "install" 선택 → ▶ 실행 → 권한 승인
// 5. 배포 → 새 배포 → 웹 앱 (실행 주체: 본인, 액세스: 모든 사용자)
// 6. 배포 URL 복사 → about.html의 SHEETS_URL에 붙여넣기

// ===== CONFIG =====
var CONFIG = {
  SHEET_NAME: '신청',
  NOTIFY_EMAIL: 'youxo@chosim.me',
  HEADERS: [
    'submitted_at',
    'applicant_name',
    'applicant_phone',
    'parent_name',
    'parent_phone',
    'parent_age',
    'relationship',
    'preferred_day',
    'preferred_time',
    'notes',
    'page_url',
    'status'
  ],
  HEADER_LABELS: [
    '신청일시',
    '신청자 이름',
    '신청자 연락처',
    '부모님 성함',
    '부모님 연락처',
    '부모님 연령대',
    '관계',
    '희망 요일',
    '희망 시간대',
    '참고사항',
    '페이지 URL',
    '상태'
  ]
};

// ===== Solapi (SMS + 알림톡) =====
var SOLAPI = {
  API_KEY: 'NCSMCKGGIEMPHY2I',
  API_SECRET: '0RIE8BHF4OCJSZAI5YPWJIL7B5MZROXC',
  SENDER: '01051751360',
  BASE_URL: 'https://api.solapi.com',
  // 알림톡 설정
  KAKAO_PFID: 'KA01PF260325052824245x3NAqMark6X',
  KAKAO_TEMPLATE_ID: 'KA01TP260325054433901tdGmPY3RVBg'
};

// ===== 최초 1회 실행: 트리거 설치 =====
// Apps Script 에디터에서 이 함수를 실행하면 권한 승인 + 트리거 설치됨
function install() {
  // 기존 트리거 삭제 (중복 방지)
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'processNewRows') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  // 5분마다 미처리 신청건 체크
  ScriptApp.newTrigger('processNewRows')
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log('트리거 설치 완료! 5분마다 새 신청건을 체크합니다.');

  // 권한 활성화를 위한 테스트 호출
  MailApp.getRemainingDailyQuota();
  UrlFetchApp.fetch('https://api.solapi.com', { muteHttpExceptions: true, method: 'get' });
  Logger.log('메일/SMS 권한 승인 완료!');
}

// ===== 웹 폼 수신 (시트 저장만) =====
function doPost(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEET_NAME);
      sheet.appendRow(CONFIG.HEADER_LABELS);
      var headerRange = sheet.getRange(1, 1, 1, CONFIG.HEADERS.length);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#FF6B6B');
      headerRange.setFontColor('#FFFFFF');
      for (var i = 1; i <= CONFIG.HEADERS.length; i++) {
        sheet.setColumnWidth(i, 140);
      }
    }

    var params = e.parameter;
    var row = CONFIG.HEADERS.map(function(key) {
      if (key === 'status') return '신규';
      if (key === 'submitted_at') {
        var kst = params[key] || new Date().toISOString();
        var d = new Date(kst);
        d.setHours(d.getHours() + 9);
        return Utilities.formatDate(d, 'GMT', 'yyyy-MM-dd HH:mm:ss');
      }
      return params[key] || '';
    });

    sheet.appendRow(row);

    // 전화번호 열을 텍스트로 강제 (앞자리 0 보존)
    var lastRow = sheet.getLastRow();
    var phoneCol = CONFIG.HEADERS.indexOf('applicant_phone') + 1;
    var parentPhoneCol = CONFIG.HEADERS.indexOf('parent_phone') + 1;
    sheet.getRange(lastRow, phoneCol).setNumberFormat('@').setValue(params['applicant_phone'] || '');
    sheet.getRange(lastRow, parentPhoneCol).setNumberFormat('@').setValue(params['parent_phone'] || '');

    return ContentService
      .createTextOutput(JSON.stringify({ result: 'success', row: sheet.getLastRow() }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ===== 트리거: 미처리 건 메일+문자 발송 =====
function processNewRows() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) return;

  var data = sheet.getDataRange().getValues();
  var statusCol = CONFIG.HEADERS.indexOf('status'); // 마지막 열

  for (var i = 1; i < data.length; i++) {
    if (data[i][statusCol] !== '신규') continue;

    var row = {};
    for (var j = 0; j < CONFIG.HEADERS.length; j++) {
      row[CONFIG.HEADERS[j]] = data[i][j];
    }

    var success = true;

    // 1) 이메일 알림
    try {
      MailApp.sendEmail({
        to: CONFIG.NOTIFY_EMAIL,
        subject: '[온담] 새 전화 신청 - ' + (row.applicant_name || '이름없음'),
        htmlBody: '<div style="font-family:sans-serif;max-width:500px;margin:0 auto">'
          + '<h2 style="color:#FF6B6B;border-bottom:2px solid #FF6B6B;padding-bottom:8px">새 전화 신청이 들어왔어요!</h2>'
          + '<table style="width:100%;border-collapse:collapse">'
          + '<tr><td style="padding:8px;font-weight:bold;color:#666">신청자</td><td style="padding:8px">' + row.applicant_name + '</td></tr>'
          + '<tr><td style="padding:8px;font-weight:bold;color:#666">신청자 연락처</td><td style="padding:8px">' + row.applicant_phone + '</td></tr>'
          + '<tr><td style="padding:8px;font-weight:bold;color:#666">부모님</td><td style="padding:8px">' + row.parent_name + ' (' + row.relationship + ')</td></tr>'
          + '<tr><td style="padding:8px;font-weight:bold;color:#666">부모님 연락처</td><td style="padding:8px">' + row.parent_phone + '</td></tr>'
          + '<tr><td style="padding:8px;font-weight:bold;color:#666">연령대</td><td style="padding:8px">' + row.parent_age + '</td></tr>'
          + '<tr><td style="padding:8px;font-weight:bold;color:#666">희망 시간</td><td style="padding:8px">' + row.preferred_day + ' ' + row.preferred_time + '</td></tr>'
          + '<tr><td style="padding:8px;font-weight:bold;color:#666">참고사항</td><td style="padding:8px">' + (row.notes || '-') + '</td></tr>'
          + '</table></div>'
      });
    } catch (mailErr) {
      Logger.log('Mail error row ' + (i+1) + ': ' + mailErr.toString());
      success = false;
    }

    // 2) 신청자에게 알림톡 (실패 시 SMS 폴백)
    try {
      if (row.applicant_phone) {
        var phone = String(row.applicant_phone).replace(/-/g, '');
        // 구글시트가 숫자로 저장하면 앞자리 0 제거됨 → 복원
        if (phone.length === 10 && !phone.startsWith('0')) {
          phone = '0' + phone;
        }
        var kakaoResult = sendKakaoAlimtalk(phone, {
          '#{신청자명}': row.applicant_name || '',
          '#{부모님성함}': row.parent_name || '',
          '#{관계}': row.relationship || '',
          '#{희망요일}': row.preferred_day || '',
          '#{희망시간}': row.preferred_time || ''
        });

        // 알림톡 실패 시 SMS 폴백
        if (!kakaoResult) {
          Logger.log('알림톡 실패, SMS 폴백 발송');
          var msg = '온담 신청 접수완료\n\n'
            + row.applicant_name + '님, 전화서비스 신청이 접수되었습니다.\n'
            + '부모님(' + row.parent_name + ')께 첫 안부전화 일정을 24시간 내 안내드릴게요.\n\n'
            + '문의 010-8326-8528';
          sendSms(phone, msg);
        }
      }
    } catch (smsErr) {
      Logger.log('알림톡/SMS error row ' + (i+1) + ': ' + smsErr.toString());
      success = false;
    }

    // 상태 업데이트
    sheet.getRange(i + 1, statusCol + 1).setValue(success ? '알림완료' : '알림실패');
  }
}

// ===== Solapi 알림톡 함수 =====
function sendKakaoAlimtalk(to, variables) {
  var dateTime = new Date().toISOString();
  var salt = Utilities.getUuid();
  var signature = hmacSha256(dateTime + salt, SOLAPI.API_SECRET);
  var authorization = 'HMAC-SHA256 apiKey=' + SOLAPI.API_KEY
    + ', date=' + dateTime
    + ', salt=' + salt
    + ', signature=' + signature;

  var payload = {
    messages: [{
      to: String(to).replace(/-/g, ''),
      from: SOLAPI.SENDER,
      kakaoOptions: {
        pfId: SOLAPI.KAKAO_PFID,
        templateId: SOLAPI.KAKAO_TEMPLATE_ID,
        variables: variables
      }
    }]
  };

  Logger.log('알림톡 payload: ' + JSON.stringify(payload));

  var response = UrlFetchApp.fetch(SOLAPI.BASE_URL + '/messages/v4/send-many/detail', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': authorization },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var result = response.getContentText();
  Logger.log('알림톡 response (full): ' + result);

  // 성공 여부 확인
  try {
    var json = JSON.parse(result);
    if (json.groupInfo && json.groupInfo.count && json.groupInfo.count.registeredFailed === 0) {
      return true;
    }
  } catch (e) {}
  return false;
}

// ===== Solapi SMS 함수 (폴백용) =====
function sendSms(to, text) {
  var dateTime = new Date().toISOString();
  var salt = Utilities.getUuid();
  var signature = hmacSha256(dateTime + salt, SOLAPI.API_SECRET);
  var authorization = 'HMAC-SHA256 apiKey=' + SOLAPI.API_KEY
    + ', date=' + dateTime
    + ', salt=' + salt
    + ', signature=' + signature;

  var payload = {
    messages: [{
      to: String(to).replace(/-/g, ''),
      from: SOLAPI.SENDER,
      text: text
    }]
  };

  var response = UrlFetchApp.fetch(SOLAPI.BASE_URL + '/messages/v4/send-many/detail', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': authorization },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  Logger.log('SMS response: ' + response.getContentText().substring(0, 200));
}

function hmacSha256(message, secret) {
  var signature = Utilities.computeHmacSha256Signature(message, secret);
  return signature.map(function(b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

// GET 요청 처리
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ result: 'success', message: 'API is live' }))
    .setMimeType(ContentService.MimeType.JSON);
}
