import React, { useEffect, useState } from 'react';

const BACKEND = import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";

export default function AuditModal({ onClose, stores = [], selectedBrand = "" }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSystemSyncs, setShowSystemSyncs] = useState(false);

  useEffect(() => {
    fetch(`${BACKEND}/api/toggle/audit-log`)
      .then(res => res.json())
      .then(json => {
        if (json.success) setLogs(json.logs);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  const handleExportCSV = () => {
    window.location.href = `${BACKEND}/api/toggle/history/download`;
  };

  // Determine which store IDs belong to the selected brand
  const validStoreIds = React.useMemo(() => {
    if (!selectedBrand) return null;
    return new Set(stores.filter(s => s.brand === selectedBrand).map(s => s.location_id));
  }, [stores, selectedBrand]);

  // Filter logs by brand and system sync preference
  const filteredLogs = logs.filter(log => {
    if (!showSystemSyncs && log.is_automated) return false;
    if (validStoreIds && !validStoreIds.has(log.store_id)) return false;
    return true;
  });

  const styles = {
    overlay: {
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(19, 38, 100, 0.4)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '40px'
    },
    modal: {
      backgroundColor: '#fff',
      borderRadius: '16px',
      width: '100%',
      maxWidth: '1000px',
      height: '80vh',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 24px 48px rgba(0,0,0,0.2)'
    },
    header: {
      padding: '24px',
      borderBottom: '1px solid rgba(19, 38, 100, 0.1)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    },
    title: {
      fontSize: '20px',
      fontWeight: '700',
      color: '#132664'
    },
    closeBtn: {
      background: 'none',
      border: 'none',
      fontSize: '24px',
      cursor: 'pointer',
      color: '#132664',
      opacity: 0.5
    },
    exportBtn: {
      backgroundColor: '#132664',
      color: 'white',
      border: 'none',
      padding: '8px 16px',
      borderRadius: '8px',
      cursor: 'pointer',
      fontWeight: '600',
      fontSize: '13px'
    },
    tableContainer: {
      flex: 1,
      overflow: 'auto',
      padding: '0 24px'
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      textAlign: 'left'
    },
    th: {
      position: 'sticky',
      top: 0,
      backgroundColor: '#f8fafc',
      padding: '16px 12px',
      color: '#132664',
      fontSize: '12px',
      textTransform: 'uppercase',
      fontWeight: '700',
      borderBottom: '2px solid rgba(19,38,100,0.1)'
    },
    td: {
      padding: '16px 12px',
      borderBottom: '1px solid rgba(19,38,100,0.05)',
      fontSize: '13px',
      color: '#334155'
    },
    resultBadge: (isSuccess) => ({
      display: 'inline-block',
      padding: '4px 8px',
      borderRadius: '12px',
      fontSize: '11px',
      fontWeight: '700',
      backgroundColor: isSuccess ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
      color: isSuccess ? '#22c55e' : '#ef4444'
    })
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.title}>Audit Log History {selectedBrand ? `(${selectedBrand})` : ''}</div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            <label style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input type="checkbox" checked={showSystemSyncs} onChange={e => setShowSystemSyncs(e.target.checked)} />
              Show System Syncs
            </label>
            <button style={styles.exportBtn} onClick={handleExportCSV}>📥 Download 48h CSV</button>
            <button style={styles.closeBtn} onClick={onClose}>&times;</button>
          </div>
        </div>
        
        <div style={styles.tableContainer}>
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Loading logs...</div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Date & Time</th>
                  <th style={styles.th}>Store Name</th>
                  <th style={styles.th}>Type</th>
                  <th style={styles.th}>Action</th>
                  <th style={styles.th}>Result</th>
                  <th style={styles.th}>Initiated By</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map(log => (
                  <tr key={log.id}>
                    <td style={styles.td}>{new Date(log.created_at).toLocaleString('en-IN')}</td>
                    <td style={{...styles.td, fontWeight: '600', color: '#132664'}}>{log.store_name}</td>
                    <td style={styles.td}>
                      {log.is_automated ? <span style={{ color: '#94a3b8', fontWeight: '600' }}>Bot</span> : 
                       log.is_bulk ? <span style={{ color: '#8b5cf6', fontWeight: '600' }}>Bulk</span> : 'Manual'}
                    </td>
                    <td style={styles.td}>{log.action}</td>
                    <td style={styles.td}>
                      <span style={styles.resultBadge(log.result === 'SUCCESS')}>
                        {log.result}
                      </span>
                    </td>
                    <td style={styles.td}>{log.email}</td>
                  </tr>
                ))}
                {filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
                      No recent activity for {selectedBrand || 'all brands'}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
