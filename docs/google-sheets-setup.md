# Google Sheets 연동 가이드 (초대장 폼 데이터 수집)

## Step 1: Google Sheet 생성

1. [Google Sheets](https://sheets.google.com) 접속
2. 새 스프레드시트 생성
3. 시트 이름: `초대장신청`
4. 1행(헤더)에 아래 입력:

| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| 타임스탬프 | 성별 | 연령대 | 관심사 | 지역 | 선호요일 | 이름 | 전화번호 | 통화희망일 | 통화희망시간 |

## Step 2: Apps Script 배포

1. 스프레드시트에서 **확장 프로그램 → Apps Script** 클릭
2. 기본 코드 전부 지우고 아래 붙여넣기:

```javascript
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('초대장신청');
    if (!sheet) {
      sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    }

    sheet.appendRow([
      new Date().toLocaleString('ko-KR', {timeZone: 'Asia/Seoul'}),
      data.gender || '',
      data.age || '',
      (data.interests || []).join(', '),
      data.region || '',
      data.day || '',
      data.name || '',
      data.phone || '',
      data.date || '',
      data.time || ''
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({result: 'success'}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({result: 'error', message: error.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// GET 요청도 처리 (테스트용)
function doGet(e) {
  return ContentService
    .createTextOutput('초대장 폼 웹훅이 정상 작동 중입니다.')
    .setMimeType(ContentService.MimeType.TEXT);
}
```

3. **저장** (Ctrl+S)
4. **배포 → 새 배포**
5. 유형: **웹 앱**
6. 설명: `초대장 폼 웹훅`
7. 실행 주체: **나**
8. 액세스 권한: **모든 사용자**
9. **배포** 클릭
10. 권한 승인 (Google 계정)
11. **웹 앱 URL 복사** (형식: `https://script.google.com/macros/s/AKfyc.../exec`)

## Step 3: index.html에 URL 입력

`index.html`의 `GOOGLE_SHEET_WEBHOOK` 변수에 URL 붙여넣기:

```javascript
var GOOGLE_SHEET_WEBHOOK = 'https://script.google.com/macros/s/여기에_붙여넣기/exec';
```

## Step 4: 테스트

1. 랜딩 페이지에서 초대장 폼 작성 후 제출
2. Google Sheet에 새 행이 추가되는지 확인
3. 브라우저 콘솔에 "Sheets saved" 로그 확인

## 참고

- Apps Script 무료 한도: 일 20,000건 요청 (충분)
- 응답 시간: 1~3초 (비동기 처리이므로 사용자 경험에 영향 없음)
- CORS: Apps Script 웹 앱은 자동으로 CORS 허용
