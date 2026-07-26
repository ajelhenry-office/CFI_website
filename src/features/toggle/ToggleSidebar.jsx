import React, { useState } from 'react';

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

export default function ToggleSidebar({ data, fetchData }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('health'); // 'health', 'recent', 'problems', 'bulk'

  const handleAction = async (endpoint, payload) => {
    try {
      await fetch(`${BACKEND}/api/toggle/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      fetchData();
    } catch (err) {
      alert(`Action failed: ${err.message}`);
    }
  };

  const styles = {
    wrapper: {
      position: 'relative',
      width: isOpen ? '320px' : '0px',
      minWidth: isOpen ? '320px' : '0px',
      transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      display: 'flex',
      alignItems: 'flex-start',
      zIndex: 100,
      pointerEvents: isOpen ? 'auto' : 'none'
    },
    toggleButton: {
      position: 'absolute',
      left: '-40px',
      top: '20px',
      backgroundColor: '#132664',
      color: 'white',
      border: 'none',
      borderTopLeftRadius: '8px',
      borderBottomLeftRadius: '8px',
      width: '40px',
      height: '40px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      boxShadow: '-2px 0 5px rgba(0,0,0,0.1)',
      pointerEvents: 'auto'
    },
    container: {
      width: '320px',
      minWidth: '320px',
      backgroundColor: '#132664',
      color: '#ffffff',
      display: 'flex',
      flexDirection: 'column',
      borderLeft: '1px solid rgba(255,255,255,0.1)',
      height: '100%',
      overflow: 'hidden',
      pointerEvents: 'auto'
    },
    navBar: {
      display: 'flex',
      justifyContent: 'space-around',
      backgroundColor: 'rgba(0,0,0,0.2)',
      padding: '8px',
      borderBottom: '1px solid rgba(255,255,255,0.1)'
    },
    navBtn: (isActive) => ({
      backgroundColor: isActive ? 'rgba(255,255,255,0.15)' : 'transparent',
      border: 'none',
      color: 'white',
      padding: '10px',
      borderRadius: '8px',
      cursor: 'pointer',
      fontSize: '18px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '4px',
      position: 'relative'
    }),
    badge: {
      position: 'absolute',
      top: '2px',
      right: '2px',
      backgroundColor: '#ef4444',
      color: 'white',
      fontSize: '9px',
      fontWeight: 'bold',
      borderRadius: '50%',
      width: '14px',
      height: '14px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    },
    contentArea: {
      flex: 1,
      overflowY: 'auto',
      padding: '20px'
    },
    title: {
      fontSize: '14px',
      fontWeight: '700',
      marginBottom: '16px',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      color: 'rgba(255,255,255,0.7)'
    },
    barContainer: {
      width: '100%',
      backgroundColor: 'rgba(255,255,255,0.1)',
      borderRadius: '4px',
      height: '8px',
      marginTop: '8px',
      overflow: 'hidden'
    },
    card: {
      backgroundColor: 'rgba(255,255,255,0.05)',
      padding: '12px',
      borderRadius: '8px',
      marginBottom: '12px',
      fontSize: '12px'
    },
    button: (color) => ({
      backgroundColor: color,
      color: 'white',
      border: 'none',
      padding: '6px 12px',
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: '700',
      cursor: 'pointer',
      marginTop: '8px',
      marginRight: '8px'
    })
  };

  const getHealthColor = (val, max) => {
    if (val <= 12) return '#22c55e'; // Green
    if (val <= 16) return '#f97316'; // Orange
    return '#ef4444'; // Red
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    const now = new Date();
    const diff = Math.floor((now - d) / 60000);
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff} mins ago`;
    return d.toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit' });
  };

  return (
    <div style={styles.wrapper}>
      <button style={styles.toggleButton} onClick={() => setIsOpen(!isOpen)} title="Toggle Dashboard">
        {isOpen ? '▶' : '◀'}
        {/* Optional notification dot on closed button if there are problems */}
        {!isOpen && data.problemStores && data.problemStores.length > 0 && (
          <div style={{...styles.badge, top: '-4px', right: '-4px'}} />
        )}
      </button>

      <div style={styles.container}>
        {/* NAVIGATION TABS */}
      <div style={styles.navBar}>
        <button style={styles.navBtn(activeTab === 'health')} onClick={() => setActiveTab('health')} title="API Health">
          ⚡
        </button>
        <button style={styles.navBtn(activeTab === 'recent')} onClick={() => setActiveTab('recent')} title="Recent Actions">
          📋
        </button>
        <button style={styles.navBtn(activeTab === 'problems')} onClick={() => setActiveTab('problems')} title="Problem Stores">
          ⚠️
          {data.problemStores && data.problemStores.length > 0 && (
            <div style={styles.badge}>{data.problemStores.length}</div>
          )}
        </button>
        <button style={styles.navBtn(activeTab === 'bulk')} onClick={() => setActiveTab('bulk')} title="Bulk Progress">
          🔄
          {data.activeBulkJob && (
            <div style={{...styles.badge, backgroundColor: '#22c55e', width: '8px', height: '8px', top: '6px', right: '6px'}} />
          )}
        </button>
      </div>

      <div style={styles.contentArea}>
        
        {/* SECTION 1: API HEALTH */}
        {activeTab === 'health' && (
          <div>
            <div style={styles.title}>API Health</div>
            {data.apiHealth ? (
              <div style={{ fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span>Status</span>
                  <span style={{ color: '#22c55e' }}>● {data.apiHealth.status}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Rate Limit (per min)</span>
                  <span>{data.apiHealth.requestsThisMinute} / {data.apiHealth.maxLimit}</span>
                </div>
                <div style={styles.barContainer}>
                  <div style={{ 
                    width: `${(data.apiHealth.requestsThisMinute / data.apiHealth.maxLimit) * 100}%`, 
                    backgroundColor: getHealthColor(data.apiHealth.requestsThisMinute, data.apiHealth.maxLimit),
                    height: '100%',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', color: 'rgba(255,255,255,0.6)', fontSize: '11px' }}>
                  <span>Last Sync: {formatTime(data.apiHealth.lastSyncTime)}</span>
                  <span>Keepalive: {data.apiHealth.keepaliveStatus}</span>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>Loading health data...</div>
            )}
          </div>
        )}

        {/* SECTION 2: RECENT ACTIONS */}
        {activeTab === 'recent' && (
          <div>
            <div style={styles.title}>Recent Actions <span style={{ textTransform: 'none', fontSize: '11px', fontWeight: '400', float: 'right' }}>Last 48 hrs</span></div>
            {data.recentActions.length === 0 && <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>No recent activity.</div>}
            
            {data.recentActions.map(a => {
              let bg = 'rgba(255,255,255,0.05)';
              let border = 'none';
              if (a.result === 'FAILED') border = '3px solid #f97316';
              else if (a.action === 'ENABLE' || a.action === 'ON') border = '3px solid #22c55e';
              else border = '3px solid #ef4444'; // Disable/OFF

              return (
                <div key={a.id} style={{...styles.card, borderLeft: border}}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: '700' }}>{a.action === 'ENABLE' ? 'TURNED ON' : 'TURNED OFF'}</span>
                    <span style={{ opacity: 0.6 }}>{formatTime(a.created_at)}</span>
                  </div>
                  <div style={{ fontSize: '13px', marginBottom: '4px' }}>{a.store_name}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', opacity: 0.7, fontSize: '11px' }}>
                    <span>{a.email}</span>
                    <span>{a.result === 'SUCCESS' ? '✅' : '❌'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* SECTION 3: PROBLEM STORES */}
        {activeTab === 'problems' && (
          <div>
            {(data.problemStores && data.problemStores.length > 0) ? (
              <div>
                <div style={{...styles.title, color: '#ef4444'}}>Problem Stores ({data.problemStores.length})</div>
                {data.problemStores.map(p => (
                  <div key={p.id} style={{...styles.card, borderLeft: '3px solid #ef4444'}}>
                    <div style={{ fontWeight: '700', fontSize: '13px' }}>{p.store_name} <span style={{ opacity: 0.6, fontSize: '10px' }}>{p.store_id}</span></div>
                    <div style={{ color: '#ef4444', margin: '4px 0' }}>
                      {p.issue_type === 'FAILED' ? `Failed ${p.fail_count} times` : 'Out of sync'}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '10px' }}>Last attempt: {formatTime(p.last_attempt_at)}</div>
                    <div>
                      <button style={styles.button('rgba(255,255,255,0.1)')} onClick={() => handleAction('problem/retry', { id: p.id })}>
                        {p.issue_type === 'FAILED' ? 'Retry Toggle' : 'Force Sync'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <div style={styles.title}>Problems</div>
                <div style={{ color: '#22c55e', fontSize: '13px' }}>✅ All stores in sync. No issues found.</div>
              </div>
            )}
          </div>
        )}

        {/* SECTION 4: BULK PROGRESS */}
        {activeTab === 'bulk' && (
          <div>
            {data.activeBulkJob ? (
              <div>
                <div style={{...styles.title, color: data.activeBulkJob.status === 'PAUSED' ? '#f97316' : '#22c55e'}}>
                  {data.activeBulkJob.status === 'PAUSED' ? 'Paused Bulk Job' : 'Running Bulk Job'}
                </div>
                <div style={{ fontSize: '13px' }}>
                  <div>Action: <strong>{data.activeBulkJob.action.toUpperCase()}</strong></div>
                  <div style={{ marginTop: '8px' }}>
                    Progress: {data.activeBulkJob.total_stores - data.activeBulkJob.pending_count} of {data.activeBulkJob.total_stores} stores
                  </div>
                  <div style={styles.barContainer}>
                    <div style={{ 
                      width: `${((data.activeBulkJob.total_stores - data.activeBulkJob.pending_count) / data.activeBulkJob.total_stores) * 100}%`, 
                      backgroundColor: data.activeBulkJob.status === 'PAUSED' ? '#f97316' : '#22c55e',
                      height: '100%',
                      transition: 'width 0.5s ease'
                    }} />
                  </div>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '12px' }}>
                    <span style={{ color: '#22c55e' }}>● {data.activeBulkJob.success_count} Success</span>
                    <span style={{ color: '#ef4444' }}>● {data.activeBulkJob.failed_count} Failed</span>
                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>● {data.activeBulkJob.pending_count} Pending</span>
                  </div>
                  <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                    {data.activeBulkJob.status === 'RUNNING' ? (
                      <button 
                        style={styles.button('#f97316')} 
                        onClick={() => handleAction('bulk/pause', { jobId: data.activeBulkJob.id })}
                      >
                        Pause Job
                      </button>
                    ) : (
                      <button 
                        style={styles.button('#22c55e')} 
                        onClick={() => handleAction('bulk/resume', { jobId: data.activeBulkJob.id })}
                      >
                        Resume Job
                      </button>
                    )}
                    <button 
                      style={styles.button('#ef4444')} 
                      onClick={() => handleAction('bulk/cancel', { jobId: data.activeBulkJob.id })}
                    >
                      Cancel Job
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <div style={styles.title}>Bulk Actions</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>No bulk jobs currently running. You can start one from the main dashboard.</div>
              </div>
            )}
          </div>
        )}

      </div>
      </div>
    </div>
  );
}
