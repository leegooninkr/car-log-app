import React, { useState, useEffect } from 'react';
import { Trash2, Edit2, Calendar, Filter, X, BarChart3, TrendingUp, Info, FileSpreadsheet } from 'lucide-react';
import { exportToNtsCsv } from '../utils/csvExport';

export default function Logs({ logs, settings, onDeleteLog, onDeleteMultipleLogs, onUpdateLog }) {
  // State for search filters
  const [selectedMonth, setSelectedMonth] = useState('전체');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [purposeFilter, setPurposeFilter] = useState('전체');

  // State for bulk selection
  const [selectedIds, setSelectedIds] = useState([]);

  // State for editing log
  const [editingLog, setEditingLog] = useState(null);

  // Clear selected checkboxes when filters change
  useEffect(() => {
    setSelectedIds([]);
  }, [selectedMonth, startDate, endDate, purposeFilter]);

  // Helper to format date with day of the week
  const formatDateWithDay = (dateStr) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const date = String(d.getDate()).padStart(2, '0');
    const day = days[d.getDay()];
    return `${month}/${date} (${day})`;
  };

  // Filter logs based on inputs
  const filteredLogs = logs.filter((log) => {
    if (selectedMonth !== '전체' && log.date.substring(0, 7) !== selectedMonth) return false;
    if (startDate && log.date < startDate) return false;
    if (endDate && log.date > endDate) return false;
    if (purposeFilter !== '전체' && log.purpose !== purposeFilter) return false;
    return true;
  });

  // Unique months list for dropdown
  const uniqueMonths = [...new Set(logs.map(log => log.date.substring(0, 7)))].sort((a, b) => b.localeCompare(a));

  // Calculate Statistics
  // Note: For business tax reporting in Korea, both "업무용" (business) and "출퇴근" (commute) count as business mileage
  const totalDistance = filteredLogs.reduce((sum, log) => sum + log.distance, 0);
  const businessDistance = filteredLogs.reduce((sum, log) => {
    if (log.purpose === '업무용' || log.purpose === '출퇴근') {
      return sum + log.distance;
    }
    return sum;
  }, 0);
  
  const businessRatio = totalDistance > 0 ? ((businessDistance / totalDistance) * 100).toFixed(1) : '0.0';

  // Group logs by Year-Month (YYYY-MM)
  const groupedLogs = {};
  filteredLogs.forEach((log) => {
    const monthKey = log.date.substring(0, 7); // "YYYY-MM"
    if (!groupedLogs[monthKey]) {
      groupedLogs[monthKey] = [];
    }
    groupedLogs[monthKey].push(log);
  });

  // Sort months in descending order (latest month first)
  const sortedMonthKeys = Object.keys(groupedLogs).sort((a, b) => b.localeCompare(a));

  // Sort logs within each month in descending order
  sortedMonthKeys.forEach((key) => {
    groupedLogs[key].sort((a, b) => new Date(b.date) - new Date(a.date) || b.id.localeCompare(a.id));
  });

  const getPurposeBadgeClass = (purpose) => {
    if (purpose === '업무용') return 'badge badge-biz';
    if (purpose === '출퇴근') return 'badge badge-commute';
    return 'badge badge-personal';
  };

  // Modal Editing Handler
  const handleEditClick = (log, e) => {
    e.stopPropagation();
    setEditingLog({ ...log });
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditingLog(prev => {
      const updated = { ...prev, [name]: value };
      
      // Auto-recalculate in edit form
      if (name === 'startOdometer' || name === 'endOdometer') {
        const start = name === 'startOdometer' ? Number(value) : Number(prev.startOdometer);
        const end = name === 'endOdometer' ? Number(value) : Number(prev.endOdometer);
        updated.distance = Math.max(0, end - start);
      } else if (name === 'distance') {
        const start = Number(prev.startOdometer);
        const dist = Number(value);
        updated.endOdometer = Math.round(start + dist);
      }
      return updated;
    });
  };

  const handleEditSubmit = (e) => {
    e.preventDefault();
    if (Number(editingLog.endOdometer) < Number(editingLog.startOdometer)) {
      alert('도착 계기판 값은 출발 계기판 값보다 크거나 같아야 합니다.');
      return;
    }
    onUpdateLog({
      ...editingLog,
      startOdometer: Number(editingLog.startOdometer),
      endOdometer: Number(editingLog.endOdometer),
      distance: Number(editingLog.distance)
    });
    setEditingLog(null);
  };

  const handleClearFilters = () => {
    setSelectedMonth('전체');
    setStartDate('');
    setEndDate('');
    setPurposeFilter('전체');
  };

  return (
    <div className="fade-in">
      <h2>운행 기록 분석 및 이력</h2>



      {/* 2. Filters Panel */}
      <div className="glass-card" style={{ padding: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
            <Filter size={15} /> 필터 및 검색
          </h3>
          {(selectedMonth !== '전체' || startDate || endDate || purposeFilter !== '전체') && (
            <button 
              onClick={handleClearFilters} 
              style={{ background: 'none', border: 'none', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
            >
              <X size={12} /> 필터 초기화
            </button>
          )}
        </div>

        <div className="form-group" style={{ marginBottom: '10px' }}>
          <label className="form-label" style={{ fontSize: '0.75rem' }}>월 선택</label>
          <select 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(e.target.value)} 
            className="form-select"
            style={{ padding: '8px 12px', fontSize: '0.85rem' }}
          >
            <option value="전체">전체 월</option>
            {uniqueMonths.map(m => {
              const [y, mon] = m.split('-');
              return <option key={m} value={m}>{y}년 {parseInt(mon)}월</option>;
            })}
          </select>
        </div>
        
        <div className="form-group" style={{ marginBottom: '10px' }}>
          <label className="form-label" style={{ fontSize: '0.75rem' }}>기간 선택</label>
          <div className="form-row">
            <input 
              type="date" 
              value={startDate} 
              onChange={(e) => setStartDate(e.target.value)} 
              className="form-control" 
              style={{ padding: '8px 10px', fontSize: '0.8rem' }}
            />
            <input 
              type="date" 
              value={endDate} 
              onChange={(e) => setEndDate(e.target.value)} 
              className="form-control" 
              style={{ padding: '8px 10px', fontSize: '0.8rem' }}
            />
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ fontSize: '0.75rem' }}>구분 필터</label>
          <select 
            value={purposeFilter} 
            onChange={(e) => setPurposeFilter(e.target.value)} 
            className="form-select"
            style={{ padding: '8px 12px', fontSize: '0.85rem' }}
          >
            <option value="전체">전체 구분</option>
            <option value="업무용">3.업무용</option>
            <option value="출퇴근">2.출퇴근</option>
            <option value="일반용">1.일반용(개인)</option>
          </select>
        </div>
      </div>

      {/* Bulk Selection Action Bar */}
      {filteredLogs.length > 0 && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          background: 'var(--glass-bg)',
          border: '1px solid var(--glass-border)',
          borderRadius: 'var(--radius-sm)',
          marginBottom: '16px',
          backdropFilter: 'blur(16px)'
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 600 }}>
            <input 
              type="checkbox" 
              checked={selectedIds.length > 0 && selectedIds.length === filteredLogs.length}
              onChange={(e) => {
                if (e.target.checked) {
                  setSelectedIds(filteredLogs.map(log => log.id));
                } else {
                  setSelectedIds([]);
                }
              }}
              style={{ width: '16px', height: '16px', accentColor: 'var(--primary)', cursor: 'pointer' }}
            />
            전체 선택 ({filteredLogs.length}건 중 {selectedIds.length}건)
          </label>

          {selectedIds.length > 0 && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                type="button" 
                onClick={() => {
                  const selectedLogs = logs.filter(log => selectedIds.includes(log.id));
                  exportToNtsCsv(settings, selectedLogs);
                }}
                className="btn-secondary btn-small"
                style={{ padding: '4px 8px', fontSize: '0.75rem', borderColor: 'var(--accent)', color: 'var(--accent)', background: 'transparent' }}
              >
                선택 내보내기
              </button>
              <button 
                type="button" 
                onClick={() => {
                  if (confirm(`선택한 ${selectedIds.length}건의 기록을 정말로 일괄 삭제하시겠습니까?`)) {
                    onDeleteMultipleLogs(selectedIds);
                    setSelectedIds([]);
                  }
                }}
                className="btn-secondary btn-small"
                style={{ padding: '4px 8px', fontSize: '0.75rem', borderColor: '#ef4444', color: '#ef4444', background: 'transparent' }}
              >
                선택 삭제
              </button>
            </div>
          )}
        </div>
      )}

      {/* 3. Grouped Timelines */}
      <div>
        {sortedMonthKeys.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', border: '1px dashed var(--border-light)', borderRadius: 'var(--radius-md)', background: 'var(--glass-bg)', color: 'var(--text-muted)' }}>
            해당 조건의 운행 기록이 존재하지 않습니다.
          </div>
        ) : (
          sortedMonthKeys.map((monthKey) => {
            const monthLogs = groupedLogs[monthKey];
            const monthTotal = monthLogs.reduce((s, l) => s + l.distance, 0);
            const [yr, mo] = monthKey.split('-');
            
            return (
              <div key={monthKey} style={{ marginBottom: '24px' }}>
                {/* Month header banner */}
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  marginBottom: '10px',
                  paddingLeft: '4px',
                  borderLeft: '3px solid var(--primary)',
                  paddingRight: '4px'
                }}>
                  <strong style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>{yr}년 {parseInt(mo)}월</strong>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>합계: <strong>{monthTotal.toLocaleString()}</strong> km</span>
                    <button 
                      type="button"
                      onClick={() => exportToNtsCsv(settings, monthLogs)}
                      className="btn-secondary btn-small"
                      style={{ 
                        padding: '3px 8px', 
                        fontSize: '0.7rem', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '4px',
                        borderColor: 'var(--accent)',
                        color: 'var(--accent)',
                        background: 'transparent'
                      }}
                      title="이 월의 내역만 운행일지 다운로드"
                    >
                      <FileSpreadsheet size={11} /> 다운
                    </button>
                  </div>
                </div>

                {/* Logs within this month */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {monthLogs.map((log) => (
                    <div 
                      key={log.id} 
                      className="log-item" 
                      style={{ 
                        flexDirection: 'row', 
                        alignItems: 'flex-start', 
                        gap: '12px',
                        padding: '14px 16px'
                      }}
                    >
                      {/* Checkbox for bulk deletion */}
                      <input 
                        type="checkbox"
                        checked={selectedIds.includes(log.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(prev => [...prev, log.id]);
                          } else {
                            setSelectedIds(prev => prev.filter(id => id !== log.id));
                          }
                        }}
                        style={{ 
                          width: '18px', 
                          height: '18px', 
                          accentColor: 'var(--primary)', 
                          marginTop: '2px', 
                          cursor: 'pointer' 
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        
                        {/* Top row: Date, Purpose Badge, Distance */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            {formatDateWithDay(log.date)}
                          </span>
                          <span className={getPurposeBadgeClass(log.purpose)}>
                            {log.purpose}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--primary)' }}>
                          {log.distance} km
                        </span>
                      </div>

                      {/* Middle row: Departure -> Destination */}
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', wordBreak: 'break-all' }}>
                        <strong>{log.depClass}</strong>
                        <span style={{ color: 'var(--text-muted)' }}>&rarr;</span>
                        <strong>{log.destClass}</strong>
                        {log.visitedPlaces && (
                          <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 500, marginLeft: '4px', wordBreak: 'break-all' }}>
                            (경유: {log.visitedPlaces})
                          </span>
                        )}
                      </div>

                      {/* Addresses (if provided) */}
                      {(log.depAddr || log.destAddr) && (
                        <div style={{ 
                          fontSize: '0.72rem', 
                          color: 'var(--text-muted)', 
                          background: 'rgba(255,255,255,0.01)', 
                          padding: '6px 8px', 
                          borderRadius: '4px', 
                          border: '1px solid rgba(255,255,255,0.02)' 
                        }}>
                          {log.depAddr && <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>출발: {log.depAddr}</div>}
                          {log.destAddr && (
                            <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', marginTop: '2px' }}>
                              도착: {log.destAddr}{log.visitedPlaces ? `(${log.visitedPlaces})` : ''}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Bottom row: Odometer values & Actions */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px', borderTop: '1px solid rgba(255, 255, 255, 0.03)' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          계기판: {log.startOdometer.toLocaleString()} ~ {log.endOdometer.toLocaleString()} km
                          {log.notes && log.notes !== '1' && <span style={{ marginLeft: '8px', color: 'var(--accent)' }}>| 비고: {log.notes}</span>}
                        </span>
                        
                        <div style={{ display: 'flex', gap: '12px' }}>
                          <button 
                            onClick={(e) => handleEditClick(log, e)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                            title="수정"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); if (confirm('정말로 삭제하시겠습니까?')) onDeleteLog(log.id); }}
                            style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                            title="삭제"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      </div> {/* Closes flex: 1 div */}
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 4. Edit Modal Sheet (Custom Overlay) */}
      {editingLog && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          overflowY: 'auto',
          padding: '20px 14px',
          zIndex: 100
        }} onClick={() => setEditingLog(null)}>
          
          <form 
            onSubmit={handleEditSubmit}
            onClick={(e) => e.stopPropagation()}
            className="fade-in"
            style={{
              width: '100%',
              maxWidth: '500px',
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-light)',
              padding: '16px 16px 20px 16px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
              marginBottom: '20px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <strong style={{ fontSize: '1.1rem', fontFamily: 'var(--font-title)' }}>운행 기록 수정</strong>
              <button 
                type="button" 
                onClick={() => setEditingLog(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">날짜</label>
                <input 
                  type="date" 
                  name="date"
                  value={editingLog.date} 
                  onChange={handleEditChange}
                  className="form-control"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">구분 (목적)</label>
                <select 
                  name="purpose"
                  value={editingLog.purpose} 
                  onChange={handleEditChange}
                  className="form-select"
                >
                  <option value="업무용">3.업무용</option>
                  <option value="출퇴근">2.출퇴근</option>
                  <option value="일반용">1.일반용(개인)</option>
                </select>
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', marginBottom: '14px' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '8px' }}>출발지 정보</div>
              <div className="form-row" style={{ gap: '8px' }}>
                <div style={{ width: '95px' }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>분류</label>
                  <select 
                    name="depClass"
                    value={editingLog.depClass} 
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditingLog(prev => ({ ...prev, depClass: val, depName: val }));
                    }}
                    className="form-select"
                    style={{ padding: '8px 10px', fontSize: '0.85rem' }}
                  >
                    <option value="자택">자택</option>
                    <option value="근무지">근무지</option>
                    <option value="거래처">거래처</option>
                    <option value="숙소">숙소</option>
                    <option value="기타">기타</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>출발 주소 또는 명칭</label>
                  <input 
                    type="text" 
                    name="depAddr"
                    value={editingLog.depAddr || ''} 
                    onChange={handleEditChange}
                    className="form-control"
                    style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                    required
                  />
                </div>
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', marginBottom: '14px' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '8px' }}>도착지 정보</div>
              <div className="form-row" style={{ gap: '8px', marginBottom: '8px' }}>
                <div style={{ width: '95px' }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>분류</label>
                  <select 
                    name="destClass"
                    value={editingLog.destClass} 
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditingLog(prev => ({ ...prev, destClass: val, destName: val }));
                    }}
                    className="form-select"
                    style={{ padding: '8px 10px', fontSize: '0.85rem' }}
                  >
                    <option value="자택">자택</option>
                    <option value="근무지">근무지</option>
                    <option value="거래처">거래처</option>
                    <option value="숙소">숙소</option>
                    <option value="기타">기타</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>도착 주소 또는 명칭</label>
                  <input 
                    type="text" 
                    name="destAddr"
                    value={editingLog.destAddr || ''} 
                    onChange={handleEditChange}
                    className="form-control"
                    style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                    required
                  />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }}>방문한 곳 (경유지)</label>
                <input 
                  type="text" 
                  name="visitedPlaces"
                  value={editingLog.visitedPlaces || ''} 
                  onChange={handleEditChange}
                  className="form-control"
                  placeholder="예: 용산역, 잠원도서관"
                />
              </div>
            </div>

            <div className="form-row" style={{ marginBottom: '14px' }}>
              <div className="form-group">
                <label className="form-label">출발 계기판 (km)</label>
                <input 
                  type="number" 
                  name="startOdometer"
                  value={editingLog.startOdometer} 
                  onChange={handleEditChange}
                  className="form-control"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">도착 계기판 (km)</label>
                <input 
                  type="number" 
                  name="endOdometer"
                  value={editingLog.endOdometer} 
                  onChange={handleEditChange}
                  className="form-control"
                  required
                />
              </div>
            </div>

            <div className="form-row" style={{ marginBottom: '18px' }}>
              <div className="form-group">
                <label className="form-label">주행 거리 (km)</label>
                <input 
                  type="number" 
                  name="distance"
                  value={editingLog.distance} 
                  onChange={handleEditChange}
                  className="form-control"
                  step="any"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">비고</label>
                <input 
                  type="text" 
                  name="notes"
                  value={editingLog.notes || ''} 
                  onChange={handleEditChange}
                  className="form-control"
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={() => setEditingLog(null)} className="btn-secondary" style={{ flex: 1 }}>
                취소
              </button>
              <button type="submit" className="btn-primary" style={{ flex: 2 }}>
                수정 완료
              </button>
            </div>

          </form>
        </div>
      )}
    </div>
  );
}
