import React from "react";
import useReviews from "./useReviews";
import ReviewCard from "./ReviewCard";

export default function ReviewsPage() {
  const { reviews, loading, filters, setFilters, fetchNewReviews, generateReply, approveReply, rejectReply } = useReviews();

  return (
    <div style={{ padding: "24px 28px", overflowY: "auto", height: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div style={{ flex: 1, padding: "12px 16px", background: "#0c1117", borderRadius: 8, border: "1px solid #3b82f6", borderLeft: "3px solid #3b82f6" }}>
          <div style={{ fontSize: 12, color: "#3b82f6", fontFamily: "'JetBrains Mono', monospace", marginBottom: 4 }}>GOOGLE DINE-IN REVIEWS</div>
          <div style={{ fontSize: 12, color: "#a0b4c8" }}>Monitor recent Google reviews and auto-generate intelligent, contextual responses.</div>
        </div>
        <button onClick={fetchNewReviews} disabled={loading} style={{ marginLeft: 16, padding: "10px 20px", background: "#ffffff", color: "#0b1628", fontWeight: 700, border: "none", borderRadius: 8, cursor: "pointer" }}>
          {loading ? "Syncing..." : "⟳ Fetch New Reviews"}
        </button>
      </div>

      {/* Filters (Basic Inline) */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        <select style={{ background: '#0c1117', color: '#e2e8f0', padding: '6px 12px', borderRadius: 6, border: '1px solid #1a2535' }} value={filters.rating} onChange={(e) => setFilters(f => ({ ...f, rating: e.target.value }))}>
          <option value="All">All Ratings</option>
          <option value="5">5 Stars</option>
          <option value="4">4 Stars</option>
          <option value="3">3 Stars</option>
          <option value="2">2 Stars</option>
          <option value="1">1 Star</option>
        </select>
        <select style={{ background: '#0c1117', color: '#e2e8f0', padding: '6px 12px', borderRadius: 6, border: '1px solid #1a2535' }} value={filters.status} onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}>
          <option value="All">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Posted">Posted</option>
          <option value="Rejected">Rejected</option>
        </select>
      </div>

      {/* Reviews Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 16 }}>
        {reviews.map(rev => (
          <ReviewCard 
            key={rev.id} 
            review={rev} 
            generateReply={generateReply} 
            approveReply={approveReply} 
            rejectReply={rejectReply} 
          />
        ))}
        {reviews.length === 0 && !loading && <div style={{ color: '#94a3b8' }}>No reviews found for these filters.</div>}
      </div>
    </div>
  );
}