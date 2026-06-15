import React, { useState, useEffect } from 'react';

const starColors = {
  5: '#10b981', // green
  4: '#14b8a6', // teal
  3: '#f59e0b', // yellow
  2: '#f97316', // orange
  1: '#ef4444'  // red
};

export default function ReviewCard({ review, generateReply, approveReply, rejectReply }) {
  const [editedReply, setEditedReply] = useState(review.ai_reply || '');
  const [isGenerating, setIsGenerating] = useState(false);

  // Force the text box to update when the AI reply arrives from the backend
  useEffect(() => {
    if (review.ai_reply) {
      setEditedReply(review.ai_reply);
      setIsGenerating(false);
    }
  }, [review.ai_reply]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    await generateReply(review);
    setIsGenerating(false);
  };

  const borderStyle = `4px solid ${starColors[review.star_rating] || '#a0b4c8'}`;
  
  return (
    <div style={{ background: '#0c1117', borderRadius: 12, padding: 20, border: '1px solid #1a2535', borderLeft: borderStyle, marginBottom: 16 }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#ffffff' }}>{review.store_name}</div>
          <div style={{ fontSize: 11, color: '#a0b4c8' }}>{review.brand}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: starColors[review.star_rating], fontWeight: 700 }}>
            {'★'.repeat(review.star_rating)}{'☆'.repeat(5 - review.star_rating)}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>{review.reviewer_name} • {new Date(review.review_date).toLocaleDateString()}</div>
        </div>
      </div>

      {/* Review Content */}
      <div style={{ color: '#e2e8f0', fontSize: 14, lineHeight: '1.5', marginBottom: 16 }}>
        "{review.review_text}"
      </div>

      <hr style={{ borderColor: '#1a2535', margin: '16px 0' }} />

      {/* AI Reply Section */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600 }}>AI Generated Reply</span>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'rgba(255,255,255,0.05)', color: '#94a3b8', textTransform: 'uppercase' }}>{review.status}</span>
        </div>
        
        {review.status === 'pending' ? (
          <>
            <textarea 
              value={editedReply} onChange={(e) => setEditedReply(e.target.value)}
              style={{ width: '100%', background: '#070b0f', border: '1px solid #1a2535', borderRadius: 8, padding: 12, color: '#e2e8f0', fontSize: 13, minHeight: 80, marginBottom: 12 }}
              placeholder={editedReply ? '' : 'Click generate to draft a reply...'}
            />
            <div style={{ display: 'flex', gap: 12 }}>
              {!editedReply && <button onClick={handleGenerate} disabled={isGenerating} style={{ padding: '6px 14px', background: isGenerating ? '#475569' : '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: isGenerating ? 'not-allowed' : 'pointer', fontSize: 12, fontWeight: 600 }}>{isGenerating ? 'Generating...' : 'Generate AI Draft'}</button>}
              {editedReply && <button onClick={() => approveReply(review, editedReply)} style={{ padding: '6px 14px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>✓ Approve & Post</button>}
              {editedReply && <button onClick={() => rejectReply(review.id)} style={{ padding: '6px 14px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>✗ Reject</button>}
            </div>
          </>
        ) : <div style={{ color: '#a0b4c8', fontSize: 13, background: 'rgba(255,255,255,0.02)', padding: 12, borderRadius: 8 }}>{review.final_reply || review.ai_reply || 'No reply generated.'}</div>}
      </div>
    </div>
  );
}