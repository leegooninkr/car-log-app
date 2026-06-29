/**
 * Formats and exports vehicle driving logs to CSV matching the Korean National Tax Service template.
 */
export const exportToNtsCsv = (settings, logs) => {
  const escapeCsv = (str) => {
    if (str === null || str === undefined) return '';
    const stringified = String(str);
    if (stringified.includes(',') || stringified.includes('"') || stringified.includes('\n')) {
      return `"${stringified.replace(/"/g, '""')}"`;
    }
    return stringified;
  };

  // Build rows array
  const rows = [];

  // Driving history headers
  rows.push([
    '년도',
    '월',
    '일',
    '부서',
    '성명',
    '구분',
    '분류(출)',
    '출발지명',
    '주소',
    '분류(도)',
    '도착지명',
    '주소',
    '주행km',
    '비고'
  ]);

  // Sort logs by date ascending to keep the record sequential
  const sortedLogs = [...logs].sort((a, b) => new Date(a.date) - new Date(b.date));

  // Rows 11+: Driving logs
  sortedLogs.forEach((log) => {
    const logDate = new Date(log.date);
    const year = logDate.getFullYear();
    const month = logDate.getMonth() + 1;
    const day = logDate.getDate();

    rows.push([
      year,
      month,
      day,
      settings.department,
      settings.driverName,
      log.purpose,      // e.g. 3.업무용, 2.출퇴근, 1.일반용 (or matching NTS options)
      log.depClass,
      log.depName,
      log.depAddr,
      log.destClass,
      log.destName,
      log.visitedPlaces ? `${log.destAddr}(${log.visitedPlaces})` : log.destAddr,
      log.distance,
      log.notes || ''
    ]);
  });

  // Convert array to CSV string
  const csvContent = rows
    .map((row) => row.map(escapeCsv).join(','))
    .join('\r\n');

  // Excel needs UTF-8 BOM to display Korean text correctly without corruption
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  
  // Trigger file download
  const dateStr = new Date().toISOString().slice(0, 10);
  const fileName = `운행일지_${settings.carNumber}_${dateStr}.csv`;
  
  // For mobile WebView/Capacitor/PWA environments: Try sharing the CSV file natively
  const file = new File([BOM + csvContent], fileName, { type: 'text/csv;charset=utf-8' });
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({
      files: [file],
      title: fileName,
      text: '국세청 양식 맞춤형 차량 운행 기록부 CSV 파일'
    })
    .then(() => console.log('Successfully shared CSV.'))
    .catch((err) => {
      console.warn('Sharing CSV failed/canceled, falling back to download:', err);
      triggerFallbackDownload(blob, fileName, csvContent);
    });
  } else {
    triggerFallbackDownload(blob, fileName, csvContent);
  }
};

const triggerFallbackDownload = (blob, fileName, csvContent) => {
  if (navigator.msSaveBlob) { // IE 10+
    navigator.msSaveBlob(blob, fileName);
  } else {
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Secondary fallback for Android WebViews (Capacitor APK) where standard link clicks do not trigger file saves
      if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        navigator.clipboard.writeText(csvContent)
          .then(() => {
            alert('모바일 기기에서 파일 다운로드가 동작하지 않는 경우, 운행 기록 데이터가 이미 클립보드에 복사되었으므로 메모장 등에 붙여넣기(Ctrl+V/Long-Press Paste)하여 저장해 주세요.');
          })
          .catch((err) => console.error('Failed to copy CSV to clipboard:', err));
      }
    }
  }
};
