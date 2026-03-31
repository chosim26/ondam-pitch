// ===== 온담 전화서비스 일일 리포트 =====
// GA4 /call 페이지 데이터를 매일 오전 10시에 이메일로 발송
//
// 설정 방법:
// 1. Google Sheets (기존 신청 시트 또는 새 시트) → 확장 프로그램 → Apps Script
// 2. 새 파일(+) → "DailyReport" → 이 코드 붙여넣기
// 3. ▶ 함수 선택 → "installDailyReport" → ▶ 실행 → 권한 승인
//    (Analytics Data API 사용 권한 승인 필요)
// 4. 끝! 매일 오전 10시에 이메일 옴
//
// ※ 첫 실행 시 "Google Analytics Data API" 서비스 추가 필요:
//    Apps Script 에디터 → 좌측 "서비스(+)" → "Google Analytics Data API" 추가

var REPORT_CONFIG = {
  GA4_PROPERTY_ID: '528139864',
  EMAIL: 'youxo@chosim.me',
  PAGE_FILTER: '/call'
};

// ===== 트리거 설치 =====
function installDailyReport() {
  // 기존 트리거 삭제
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendDailyReport') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  // 매일 오전 10시 KST
  ScriptApp.newTrigger('sendDailyReport')
    .timeBased()
    .everyDays(1)
    .atHour(10)
    .nearMinute(0)
    .inTimezone('Asia/Seoul')
    .create();

  Logger.log('일일 리포트 트리거 설치 완료! 매일 오전 10시에 발송됩니다.');

  // 테스트 발송
  sendDailyReport();
}

// ===== 메인: 일일 리포트 발송 =====
function sendDailyReport() {
  try {
    var today = new Date();
    var yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    var twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    var sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // 어제 데이터
    var yesterdayData = getCallPageData(formatDate(yesterday), formatDate(yesterday));
    // 그저께 데이터 (비교용)
    var prevDayData = getCallPageData(formatDate(twoDaysAgo), formatDate(twoDaysAgo));
    // 7일 누적
    var weekData = getCallPageData(formatDate(sevenDaysAgo), formatDate(yesterday));

    var html = buildEmailHtml(yesterdayData, prevDayData, weekData, yesterday);

    MailApp.sendEmail({
      to: REPORT_CONFIG.EMAIL,
      subject: '[온담] /call 일일 리포트 - ' + formatDateKr(yesterday),
      htmlBody: html
    });

    Logger.log('일일 리포트 발송 완료: ' + formatDateKr(yesterday));
  } catch (error) {
    Logger.log('리포트 에러: ' + error.toString());
    MailApp.sendEmail({
      to: REPORT_CONFIG.EMAIL,
      subject: '[온담] 일일 리포트 에러',
      body: '리포트 생성 중 에러: ' + error.toString()
    });
  }
}

// ===== GA4 데이터 조회 =====
function getCallPageData(startDate, endDate) {
  var request = AnalyticsData.newRunReportRequest();

  // 측정기준: 이벤트 이름
  var eventDim = AnalyticsData.newDimension();
  eventDim.name = 'eventName';
  request.dimensions = [eventDim];

  // 측정항목: 이벤트 수, 활성 사용자
  var eventCount = AnalyticsData.newMetric();
  eventCount.name = 'eventCount';
  var activeUsers = AnalyticsData.newMetric();
  activeUsers.name = 'activeUsers';
  request.metrics = [eventCount, activeUsers];

  // 날짜
  var dateRange = AnalyticsData.newDateRange();
  dateRange.startDate = startDate;
  dateRange.endDate = endDate;
  request.dateRanges = [dateRange];

  // 필터: /call 페이지만
  var filter = AnalyticsData.newFilterExpression();
  var dimFilter = AnalyticsData.newFilter();
  dimFilter.fieldName = 'pagePath';
  var stringFilter = AnalyticsData.newStringFilter();
  stringFilter.value = REPORT_CONFIG.PAGE_FILTER;
  stringFilter.matchType = 'CONTAINS';
  dimFilter.stringFilter = stringFilter;
  filter.filter = dimFilter;
  request.dimensionFilter = filter;

  var response = AnalyticsData.Properties.runReport(request, 'properties/' + REPORT_CONFIG.GA4_PROPERTY_ID);

  // 파싱
  var data = {};
  if (response.rows) {
    for (var i = 0; i < response.rows.length; i++) {
      var row = response.rows[i];
      var eventName = row.dimensionValues[0].value;
      data[eventName] = {
        count: parseInt(row.metricValues[0].value) || 0,
        users: parseInt(row.metricValues[1].value) || 0
      };
    }
  }

  // 총 사용자 수 별도 조회
  var userRequest = AnalyticsData.newRunReportRequest();
  var userMetric = AnalyticsData.newMetric();
  userMetric.name = 'activeUsers';
  userRequest.metrics = [userMetric];
  var userDateRange = AnalyticsData.newDateRange();
  userDateRange.startDate = startDate;
  userDateRange.endDate = endDate;
  userRequest.dateRanges = [userDateRange];
  userRequest.dimensionFilter = filter;

  var userResponse = AnalyticsData.Properties.runReport(userRequest, 'properties/' + REPORT_CONFIG.GA4_PROPERTY_ID);
  var totalUsers = 0;
  if (userResponse.rows && userResponse.rows.length > 0) {
    totalUsers = parseInt(userResponse.rows[0].metricValues[0].value) || 0;
  }
  data._totalUsers = totalUsers;

  return data;
}

// ===== 이메일 HTML 생성 =====
function buildEmailHtml(today, prev, week, date) {
  var visitors = today._totalUsers || 0;
  var prevVisitors = prev._totalUsers || 0;
  var weekVisitors = week._totalUsers || 0;

  var pageViews = getVal(today, 'page_view');
  var formStart = getVal(today, 'form_start');
  var formSubmit = getVal(today, 'form_submit');
  var ctaClick = getVal(today, 'cta_click');
  var sectionView = getVal(today, 'section_view');
  var scrollDepth = getVal(today, 'scroll_depth');
  var timeOnPage = getVal(today, 'time_on_page');
  var reportClick = getVal(today, 'sample_report_click');

  // 전일 대비
  var prevPageViews = getVal(prev, 'page_view');
  var prevFormSubmit = getVal(prev, 'form_submit');

  // 주간 누적
  var weekFormSubmit = getVal(week, 'form_submit');
  var weekPageViews = getVal(week, 'page_view');

  // 전환율 계산
  var convRate = visitors > 0 ? ((formSubmit / visitors) * 100).toFixed(1) : '0';
  var weekConvRate = weekVisitors > 0 ? ((weekFormSubmit / weekVisitors) * 100).toFixed(1) : '0';
  var formStartRate = visitors > 0 ? ((formStart / visitors) * 100).toFixed(1) : '0';
  var formCompleteRate = formStart > 0 ? ((formSubmit / formStart) * 100).toFixed(1) : '0';

  // 인사이트 자동 생성
  var insights = [];

  // 방문자 변화
  if (prevVisitors > 0) {
    var change = ((visitors - prevVisitors) / prevVisitors * 100).toFixed(0);
    if (change > 20) insights.push('방문자 전일 대비 +' + change + '% 증가! 광고 효과 확인 필요');
    if (change < -20) insights.push('방문자 전일 대비 ' + change + '% 감소. 광고 노출/예산 확인');
  }

  // 전환율
  if (parseFloat(convRate) >= 10) {
    insights.push('H2 목표 달성! 전환율 ' + convRate + '% (목표 10%)');
  } else if (visitors >= 5 && parseFloat(convRate) < 5) {
    insights.push('전환율 ' + convRate + '%로 목표(10%) 미달. 폼 섹션 또는 CTA 개선 검토');
  }

  // 폼 시작 vs 완료
  if (formStart > 0 && formSubmit === 0) {
    insights.push('폼 시작 ' + formStart + '명이나 제출 0건. 폼 필드가 너무 많거나 불안 요소 확인');
  }
  if (formStart > 0 && parseFloat(formCompleteRate) < 50) {
    insights.push('폼 완료율 ' + formCompleteRate + '%. 폼 중간 이탈 발생 — 필드 수 줄이거나 안심 카피 강화');
  }

  // CTA 클릭
  if (visitors >= 5 && ctaClick === 0) {
    insights.push('CTA 클릭 0건. 히어로/Mid CTA 문구 또는 위치 개선 필요');
  }

  // 체류시간
  if (visitors >= 5 && timeOnPage < 2) {
    insights.push('체류시간 이벤트 적음. 히어로 섹션에서 빠르게 이탈 가능성');
  }

  // 스크롤
  if (visitors >= 5 && scrollDepth < 2) {
    insights.push('스크롤 깊이 부족. 상단 콘텐츠(히어로~S2)에서 이탈. 훅 카피 강화 필요');
  }

  if (insights.length === 0) {
    if (visitors === 0) {
      insights.push('어제 방문자 없음. 광고가 집행 중인지 확인해주세요.');
    } else {
      insights.push('데이터 정상 수집 중. 패턴 분석은 3일 이상 쌓이면 더 정확해져요.');
    }
  }

  var html = '<div style="font-family:Pretendard,-apple-system,sans-serif;max-width:600px;margin:0 auto;background:#fff">'

    // 헤더
    + '<div style="background:linear-gradient(135deg,#FF6B6B,#E85555);padding:24px;border-radius:12px 12px 0 0">'
    + '<h1 style="color:#fff;margin:0;font-size:20px">온담 전화서비스 일일 리포트</h1>'
    + '<p style="color:rgba(255,255,255,0.85);margin:4px 0 0;font-size:14px">' + formatDateKr(date) + ' (어제) | /call 페이지</p>'
    + '</div>'

    // 핵심 지표 카드
    + '<div style="display:flex;gap:0;border:1px solid #eee;border-top:none">'
    + metricCard('방문자', visitors, prevVisitors, '명')
    + metricCard('폼 제출', formSubmit, prevFormSubmit, '건')
    + metricCard('전환율', convRate, null, '%')
    + '</div>'

    // 7일 누적
    + '<div style="background:#F8F9FA;padding:16px 24px;border:1px solid #eee;border-top:none">'
    + '<span style="font-size:13px;color:#666">7일 누적 | 방문 <b>' + weekVisitors + '</b>명 · 신청 <b>' + weekFormSubmit + '</b>건 · 전환율 <b>' + weekConvRate + '%</b></span>'
    + '</div>'

    // 퍼널
    + '<div style="padding:20px 24px;border:1px solid #eee;border-top:none">'
    + '<h2 style="font-size:16px;margin:0 0 12px;color:#333">퍼널 분석</h2>'
    + '<table style="width:100%;border-collapse:collapse;font-size:14px">'
    + funnelRow('페이지 방문', pageViews, visitors, null)
    + funnelRow('스크롤 (25%+)', scrollDepth, visitors, '스크롤 한 사람')
    + funnelRow('섹션 도달', sectionView, visitors, '섹션 본 횟수')
    + funnelRow('체류 30초+', timeOnPage, visitors, '체류시간 이벤트')
    + funnelRow('CTA 클릭', ctaClick, visitors, '')
    + funnelRow('리포트 클릭', reportClick, visitors, '')
    + funnelRow('폼 시작', formStart, visitors, formStartRate + '% 시작률')
    + funnelRow('폼 제출', formSubmit, visitors, convRate + '% 전환율')
    + '</table>'
    + '</div>'

    // 인사이트
    + '<div style="padding:20px 24px;border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px">'
    + '<h2 style="font-size:16px;margin:0 0 12px;color:#FF6B6B">인사이트</h2>'
    + '<ul style="margin:0;padding:0 0 0 20px;font-size:14px;color:#333;line-height:1.8">'
    + insights.map(function(i){ return '<li>' + i + '</li>'; }).join('')
    + '</ul>'
    + '</div>'

    // 푸터
    + '<div style="padding:16px 24px;text-align:center">'
    + '<a href="https://analytics.google.com/analytics/web/#/a387381643p528139864/analysis" style="color:#FF6B6B;font-size:13px;text-decoration:none">GA4에서 자세히 보기 →</a>'
    + '</div>'

    + '</div>';

  return html;
}

// ===== 헬퍼 함수 =====
function getVal(data, eventName) {
  return data[eventName] ? data[eventName].count : 0;
}

function formatDate(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function formatDateKr(d) {
  return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + ['일','월','화','수','목','금','토'][d.getDay()] + ')';
}

function pad(n) { return n < 10 ? '0' + n : '' + n; }

function metricCard(label, value, prevValue, unit) {
  var changeHtml = '';
  if (prevValue !== null && prevValue > 0) {
    var diff = value - prevValue;
    var pct = ((diff / prevValue) * 100).toFixed(0);
    var color = diff >= 0 ? '#4CAF50' : '#F44336';
    var arrow = diff >= 0 ? '▲' : '▼';
    changeHtml = '<span style="font-size:12px;color:' + color + '">' + arrow + ' ' + Math.abs(pct) + '%</span>';
  }
  return '<div style="flex:1;padding:16px 20px;text-align:center;border-right:1px solid #eee">'
    + '<div style="font-size:12px;color:#666">' + label + '</div>'
    + '<div style="font-size:28px;font-weight:700;color:#333;margin:4px 0">' + value + '<span style="font-size:14px;color:#999">' + unit + '</span></div>'
    + changeHtml
    + '</div>';
}

function funnelRow(label, count, total, note) {
  var pct = total > 0 ? Math.round((count / total) * 100) : 0;
  var barWidth = Math.max(pct, 2);
  return '<tr>'
    + '<td style="padding:6px 0;color:#333;width:100px">' + label + '</td>'
    + '<td style="padding:6px 8px"><div style="background:#FFE4E4;border-radius:4px;height:18px;width:100%"><div style="background:#FF6B6B;border-radius:4px;height:18px;width:' + barWidth + '%;min-width:2px"></div></div></td>'
    + '<td style="padding:6px 0;text-align:right;color:#333;font-weight:600;width:40px">' + count + '</td>'
    + '<td style="padding:6px 0 6px 8px;color:#999;font-size:12px;width:80px">' + (note || '') + '</td>'
    + '</tr>';
}
