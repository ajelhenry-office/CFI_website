import React from "react";
import useReviews from "./useReviews";
import ReviewCard from "./ReviewCard";

export default function ReviewsPage({ globalFilters }) {
  const { reviews, loading, filters, setFilters, fetchNewReviews, generateReply, approveReply, rejectReply } = useReviews();

  const filtered = reviews.filter(r => {
    if (globalFilters?.brands && globalFilters.brands.length > 0) {
      if (!r.brand || !globalFilters.brands.some(b => r.brand.toLowerCase().includes(b.toLowerCase()))) return false;
    }
    return true;
  });

  const selectStyle = {
    background: '#ffffff',
    color: '#132664',
    padding: '6px 12px',
    borderRadius: 18,
    border: '1px solid #132664',
    fontSize: 12,
    fontWeight: '600',
    cursor: 'pointer',
    outline: 'none'
  };

  return (
    <div style={{ padding: "32px 40px", overflowY: "auto", height: "100%", boxSizing: "border-box", backgroundColor: "#ffffff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, gap: 16 }}>
        <div style={{ flex: 1, padding: "16px", background: "rgba(19, 38, 100, 0.03)", borderRadius: 12, border: "1px solid #132664", borderLeft: "4px solid #132664" }}>
          <div style={{ fontSize: 11, color: "#132664", fontFamily: "ui-monospace, monospace", marginBottom: 4, fontWeight: "800", letterSpacing: "1px" }}>GOOGLE DINE-IN CLIENT REVIEWS</div>
          <div style={{ fontSize: 12, color: "rgba(19, 38, 100, 0.8)", lineHeight: "1.5" }}>Monitor incoming Google Maps reviews and generate contextual AI response drafts.</div>
        </div>
        <button 
          onClick={fetchNewReviews} 
          disabled={loading} 
          style={{ padding: "10px 20px", background: "#132664", color: "#ffffff", fontWeight: 700, border: "none", borderRadius: "24px", cursor: "pointer", fontSize: "12px" }}
        >
          {loading ? "Syncing..." : "⟳ Fetch Reviews"}
        </button>
      </div>

      {/* Filters (Basic Inline) */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <select 
          style={selectStyle} 
          value={filters.rating} 
          onChange={(e) => setFilters(f => ({ ...f, rating: e.target.value }))}
        >
          <option value="All">All Ratings</option>
          <option value="5">5 Stars</option>
          <option value="4">4 Stars</option>
          <option value="3">3 Stars</option>
          <option value="2">2 Stars</option>
          <option value="1">1 Star</option>
        </select>
        
        <select 
          style={selectStyle} 
          value={filters.status} 
          onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
        >
          <option value="All">All Statuses</option>
          <option value="Pending">Pending</option>
          <option value="Posted">Posted</option>
          <option value="Rejected">Rejected</option>
        </select>
      </div>

      {/* Reviews Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 20, paddingBottom: "40px" }}>
        {filtered.map(rev => (
          <ReviewCard 
            key={rev.id} 
            review={rev} 
            generateReply={generateReply} 
            approveReply={approveReply} 
            rejectReply={rejectReply} 
          />
        ))}
        {filtered.length === 0 && !loading && (
          <div style={{ color: 'rgba(19, 38, 100, 0.6)', gridColumn: "1 / -1", textAlign: "center", padding: "40px" }}>
            No reviews found matching active filters.
          </div>
        )}
      </div>
    </div>
  );
}