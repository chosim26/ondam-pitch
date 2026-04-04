// ===== 온담 모임 신청 폼 → Google Sheets + SMS/알림톡 =====
//
// 설정 방법:
// 1. Google Sheets에서 확장 프로그램 → Apps Script
// 2. 기존 코드 전부 지우고 이 코드 전체 복사 → 붙여넣기
// 3. ▶ 함수 선택 드롭다운에서 "install" 선택 → ▶ 실행 → 권한 승인
// 4. 배포 → 새 배포 → 웹 앱 (실행 주체: 본인, 액세스: 모든 사용자)
// 5. 배포 URL 복사 → index.html의 GOOGLE_SHEET_WEBHOOK에 붙여넣기
//
// ※ 기존 배포가 있으면 "배포 관리 → 새 버전"으로 업데이트

// ===== CONFIG =====
var CONFIG = {
  SHEET_NAME: '초대장신청',
  NOTIFY_EMAIL: 'youxo@chosim.me',
  HEADERS: [
    'submitted_at', 'submit_type',
    'gender', 'age', 'interests', 'region', 'day',
    'name', 'phone',
    'date', 'time',
    'intro', 'available_time',
    'status'
  ],
  HEADER_LABELS: [
    '신청일시', '제출유형',
    '성별', '연령대', '관심모임', '지역', '선호요일',
    '이름', '전화번호',
    '통화희망일', '통화희망시간',
    '자기소개', '참여가능시간대',
    '상태'
  ]
};

// ===== Solapi (SMS + 알림톡) =====
var SOLAPI = {
  API_KEY: 'NCSMCKGGIEMPHY2I',
  API_SECRET: '0RIE8BHF4OCJSZAI5YPWJIL7B5MZROXC',
  SENDER: '01051751360',
  BASE_URL: 'https://api.solapi.com',
  // 알림톡 (필요시 설정)
  KAKAO_PFID: 'KA01PF260325052824245x3NAqMark6X',
  KAKAO_TEMPLATE_ID: ''  // 모임용 템플릿 ID (없으면 SMS 폴백)
};

// ===== 최초 1회 실행: 시트 초기화 + 권한 승인 =====
function install() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  }

  // 헤더가 없으면 추가
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(CONFIG.HEADER_LABELS);
    var headerRange = sheet.getRange(1, 1, 1, CONFIG.HEADERS.length);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#FF6B6B');
    headerRange.setFontColor('#FFFFFF');
    for (var i = 1; i <= CONFIG.HEADERS.length; i++) {
      sheet.setColumnWidth(i, 130);
    }
    // 전화번호 열 텍스트 형식
    var phoneCol = CONFIG.HEADERS.indexOf('phone') + 1;
    sheet.getRange(2, phoneCol, 1000, 1).setNumberFormat('@');
  }

  // 권한 활성화 테스트
  MailApp.getRemainingDailyQuota();
  UrlFetchApp.fetch('https://api.solapi.com', { muteHttpExceptions: true, method: 'get' });
  Logger.log('설치 완료! 시트 "' + CONFIG.SHEET_NAME + '" 준비됨, 메일/SMS 권한 승인됨');
}

// ===== 웹 폼 수신 =====
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEET_NAME);
      sheet.appendRow(CONFIG.HEADER_LABELS);
    }

    var now = new Date();
    var kst = Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
    var submitType = data.submitType || 'basic';

    // interests, region, day, availableTime은 이미 join된 상태로 올 수 있음
    var row = [
      kst,
      submitType === 'basic' ? '기본신청' : '전체완료',
      data.gender || '',
      data.age || '',
      Array.isArray(data.interests) ? data.interests.join(', ') : (data.interests || ''),
      Array.isArray(data.region) ? data.region.join(', ') : (data.region || ''),
      Array.isArray(data.day) ? data.day.join(', ') : (data.day || ''),
      data.name || '',
      data.phone || '',
      data.date || '',
      data.time || '',
      data.intro || '',
      Array.isArray(data.availableTime) ? data.availableTime.join(', ') : (data.availableTime || ''),
      '신규'
    ];

    sheet.appendRow(row);

    // 전화번호 열 텍스트 형식 보존
    var lastRow = sheet.getLastRow();
    var phoneCol = CONFIG.HEADERS.indexOf('phone') + 1;
    sheet.getRange(lastRow, phoneCol).setNumberFormat('@').setValue(data.phone || '');

    // 1차 제출(basic)일 때만 SMS + 이메일 발송
    if (submitType === 'basic' && data.phone && data.name) {
      // SMS 발송
      try {
        var phone = String(data.phone).replace(/-/g, '');
        if (phone.length === 10 && !phone.startsWith('0')) {
          phone = '0' + phone;
        }

        var smsText = '[온담] 신청 접수완료\n\n'
          + data.name + '님, 모임 신청이 접수되었습니다.\n'
          + '선택하신 시간에 전화드릴게요.\n\n'
          + '온담 드림';
        sendSms(phone, smsText);

        sheet.getRange(lastRow, CONFIG.HEADERS.indexOf('status') + 1).setValue('SMS발송');
      } catch (smsErr) {
        Logger.log('SMS error: ' + smsErr.toString());
        sheet.getRange(lastRow, CONFIG.HEADERS.indexOf('status') + 1).setValue('SMS실패');
      }

      // 이메일 알림 (관리자)
      try {
        MailApp.sendEmail({
          to: CONFIG.NOTIFY_EMAIL,
          subject: '[온담] 새 모임 신청 - ' + data.name,
          htmlBody: '<div style="font-family:sans-serif;max-width:500px;margin:0 auto">'
            + '<h2 style="color:#FF6B6B;border-bottom:2px solid #FF6B6B;padding-bottom:8px">새 모임 신청이 들어왔어요!</h2>'
            + '<table style="width:100%;border-collapse:collapse">'
            + tr('이름', data.name)
            + tr('전화번호', data.phone)
            + tr('성별/연령', data.gender + ' / ' + data.age)
            + tr('관심모임', Array.isArray(data.interests) ? data.interests.join(', ') : (data.interests || ''))
            + tr('지역', Array.isArray(data.region) ? data.region.join(', ') : (data.region || ''))
            + tr('선호요일', Array.isArray(data.day) ? data.day.join(', ') : (data.day || ''))
            + '</table></div>'
        });
      } catch (mailErr) {
        Logger.log('Mail error: ' + mailErr.toString());
      }
    }

    // 2차 제출(full)일 때는 상태만 업데이트
    if (submitType === 'full') {
      sheet.getRange(lastRow, CONFIG.HEADERS.indexOf('status') + 1).setValue('완료');
    }

    return ContentService
      .createTextOutput(JSON.stringify({ result: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    Logger.log('doPost error: ' + error.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// 이메일 테이블 행 헬퍼
function tr(label, value) {
  return '<tr><td style="padding:8px;font-weight:bold;color:#666;width:120px">' + label + '</td>'
    + '<td style="padding:8px">' + (value || '-') + '</td></tr>';
}

// ===== Solapi SMS 함수 =====
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

  Logger.log('SMS payload: ' + JSON.stringify(payload));

  var response = UrlFetchApp.fetch(SOLAPI.BASE_URL + '/messages/v4/send-many/detail', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': authorization },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  var result = response.getContentText();
  Logger.log('SMS response: ' + result.substring(0, 300));
  return result;
}

// HMAC-SHA256 서명
function hmacSha256(message, secret) {
  var signature = Utilities.computeHmacSha256Signature(message, secret);
  return signature.map(function(b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

// GET 요청 (테스트용)
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ result: 'success', message: '온담 초대장 폼 웹훅 정상 작동 중' }))
    .setMimeType(ContentService.MimeType.JSON);
}
