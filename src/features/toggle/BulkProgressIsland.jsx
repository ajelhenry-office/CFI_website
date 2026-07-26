import React, { useEffect, useState, useRef } from 'react';
import { pauseBulkJob, resumeBulkJob, cancelBulkJob } from '../../api';

export default function BulkProgressIsland({ activeBulkJob, fetchData }) {
  const [localJob, setLocalJob] = useState(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isCancelled, setIsCancelled] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  
  // Dragging state
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (activeBulkJob && ['RUNNING', 'PAUSED'].includes(activeBulkJob.status)) {
      setLocalJob(activeBulkJob);
      setIsCompleted(false);
      setIsCancelled(false);
    } else if (localJob && !isCompleted && !isCancelled && (!activeBulkJob || activeBulkJob.status === 'COMPLETED' || activeBulkJob.status === 'CANCELLED')) {
      if (activeBulkJob) setLocalJob(activeBulkJob); 
      
      if (activeBulkJob?.status === 'CANCELLED') {
        setIsCancelled(true);
      } else {
        setIsCompleted(true);
      }
      setIsMinimized(false);
      
      const timer = setTimeout(() => {
        setLocalJob(null);
        setIsCompleted(false);
        setIsCancelled(false);
        setPosition({ x: 0, y: 0 }); // reset position on close
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [activeBulkJob, isCompleted, isCancelled, localJob]);

  // Drag Handlers
  const handlePointerDown = (e) => {
    // Only drag from the top row/title area
    if (e.target.closest('button')) return;
    setIsDragging(true);
    dragStartPos.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    };
    e.target.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStartPos.current.x,
      y: e.clientY - dragStartPos.current.y
    });
  };

  const handlePointerUp = (e) => {
    setIsDragging(false);
    e.target.releasePointerCapture(e.pointerId);
  };

  if (!localJob) return null;

  const total = localJob.total_stores || 1;
  const success = localJob.success_count || 0;
  const failed = localJob.failed_count || 0;
  const pending = localJob.pending_count || 0;
  const progressPercent = Math.min(100, Math.round(((success + failed) / total) * 100));
  
  const isPaused = localJob.status === 'PAUSED';

  const handlePause = async () => {
    try {
      setLocalJob(prev => ({ ...prev, status: 'PAUSED' }));
      await pauseBulkJob(localJob.id);
      if (fetchData) fetchData();
    } catch (e) { alert(e.message); }
  };

  const handleResume = async () => {
    try {
      setLocalJob(prev => ({ ...prev, status: 'RUNNING' }));
      await resumeBulkJob(localJob.id);
      if (fetchData) fetchData();
    } catch (e) { alert(e.message); }
  };

  const handleCancel = async () => {
    if (!window.confirm("Are you sure you want to cancel? Stores that have already been modified will remain modified.")) return;
    try {
      setLocalJob(prev => ({ ...prev, status: 'CANCELLED' }));
      await cancelBulkJob(localJob.id);
      if (fetchData) fetchData();
    } catch (e) { alert(e.message); }
  };

  const styles = {
    islandContainer: {
      position: 'fixed',
      top: '30px',
      left: '50%',
      // We start centered via translateX(-50%). When dragging, we add pixel offsets via position state.
      transform: `translate(calc(-50% + ${position.x}px), ${position.y}px)`,
      width: isMinimized ? '280px' : '450px',
      backgroundColor: isCompleted ? '#22c55e' : (isCancelled ? '#ef4444' : '#132664'),
      borderRadius: '24px',
      boxShadow: isDragging ? '0 20px 48px rgba(19, 38, 100, 0.5)' : '0 12px 32px rgba(19, 38, 100, 0.4)',
      color: '#ffffff',
      display: 'flex',
      flexDirection: 'column',
      padding: isMinimized ? '12px 20px' : '16px 24px',
      zIndex: 99999,
      // Disable CSS transition during drag so it tracks the mouse smoothly
      transition: isDragging ? 'none' : 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
      overflow: 'hidden',
      cursor: isDragging ? 'grabbing' : 'auto'
    },
    topRow: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: (isCompleted || isCancelled || isMinimized) ? '0' : '12px',
      cursor: isDragging ? 'grabbing' : 'grab' // Indicate it's draggable
    },
    title: {
      fontSize: isMinimized ? '12px' : '14px',
      fontWeight: '700',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      userSelect: 'none'
    },
    controls: {
      display: 'flex',
      gap: '8px'
    },
    btn: {
      background: 'rgba(255,255,255,0.15)',
      border: 'none',
      color: '#fff',
      padding: '4px 10px',
      borderRadius: '12px',
      fontSize: '11px',
      fontWeight: '700',
      cursor: 'pointer',
      transition: 'background 0.2s'
    },
    btnCancel: {
      background: 'rgba(239, 68, 68, 0.8)',
      border: 'none',
      color: '#fff',
      padding: '4px 10px',
      borderRadius: '12px',
      fontSize: '11px',
      fontWeight: '700',
      cursor: 'pointer',
      transition: 'background 0.2s'
    },
    iconBtn: {
      background: 'transparent',
      border: 'none',
      color: '#fff',
      padding: '4px',
      cursor: 'pointer',
      opacity: 0.8,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    },
    countersRow: {
      display: 'flex',
      gap: '16px',
      fontSize: '12px',
      fontWeight: '600',
      marginBottom: '12px',
      opacity: 0.9,
      userSelect: 'none'
    },
    progressTrack: {
      width: '100%',
      height: '6px',
      backgroundColor: 'rgba(255,255,255,0.2)',
      borderRadius: '3px',
      overflow: 'hidden'
    },
    progressFill: {
      height: '100%',
      width: `${progressPercent}%`,
      backgroundColor: isCancelled ? '#fca5a5' : '#22c55e',
      transition: 'width 0.5s ease-in-out'
    }
  };

  if (isCompleted || isCancelled) {
    const actionWord = localJob.action === 'enable' ? 'ENABLING' : 'DISABLING';
    return (
      <div style={styles.islandContainer}>
        <div style={styles.topRow}>
          <div style={styles.title}>
            {isCancelled ? `⏹️ Bulk ${actionWord} Cancelled!` : `✨ Bulk ${actionWord} done!`} 
            ✅ {success} Succeeded, ❌ {failed} Failed.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.islandContainer}>
      <div 
        style={styles.topRow}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div style={styles.title}>
          {localJob.action === 'enable' ? '🟢 Turning ONLINE' : '🔴 Turning OFFLINE'} — {total} Stores
          {isPaused && <span style={{color: '#fbbf24', fontSize: '11px', paddingLeft: '8px'}}>(PAUSED)</span>}
        </div>
        <div style={styles.controls}>
          {!isMinimized && (
            <>
              {isPaused ? (
                <button style={styles.btn} onClick={handleResume}>▶ Resume</button>
              ) : (
                <button style={styles.btn} onClick={handlePause}>⏸ Pause</button>
              )}
              <button style={styles.btnCancel} onClick={handleCancel}>⏹️ Cancel</button>
            </>
          )}
          <button style={styles.iconBtn} onClick={() => setIsMinimized(!isMinimized)} title={isMinimized ? "Expand" : "Minimize"}>
            {isMinimized ? '🔽' : '🔼'}
          </button>
        </div>
      </div>
      
      {!isMinimized && (
        <>
          <div style={styles.countersRow}>
            <span>⏳ Pending: {pending}</span>
            <span>✅ Success: {success}</span>
            <span>❌ Failed: {failed}</span>
          </div>

          <div style={styles.progressTrack}>
            <div style={styles.progressFill}></div>
          </div>
        </>
      )}
    </div>
  );
}
