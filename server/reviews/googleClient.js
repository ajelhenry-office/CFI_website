import { google } from 'googleapis';

class GoogleClient {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );

    if (process.env.GOOGLE_REFRESH_TOKEN) {
      this.oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
      });
    }
  }

  async getAccessToken() {
    const { token } = await this.oauth2Client.getAccessToken();
    return token;
  }

  /**
   * Fetches the latest reviews for a specific location.
   * Path format expected: 'accounts/{accountId}/locations/{locationId}'
   * @param {string} locationPath 
   */
  async getLatestReviews(locationPath) {
    if (!process.env.GOOGLE_REFRESH_TOKEN) {
      console.warn('[Google API] No refresh token set. Returning empty mock reviews.');
      return [];
    }
    
    const token = await this.getAccessToken();
    const url = `https://mybusiness.googleapis.com/v4/${locationPath}/reviews?pageSize=50&orderBy=updateTime desc`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Google API Fetch Error: ${response.status} ${err}`);
    }

    const data = await response.json();
    return data.reviews || [];
  }

  /**
   * Posts a reply to a specific review.
   * @param {string} reviewId - The full review name/id string from Google.
   * @param {string} replyText - The reply text.
   */
  async postReply(reviewId, replyText) {
    if (!process.env.GOOGLE_REFRESH_TOKEN) {
      console.log(`[Google API DRY RUN] Would post reply to ${reviewId}: "${replyText}"`);
      return { comment: replyText };
    }

    const token = await this.getAccessToken();
    const url = `https://mybusiness.googleapis.com/v4/${reviewId}/reply`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ comment: replyText })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Google API Reply Error: ${response.status} ${err}`);
    }

    return await response.json();
  }
}

export const googleClient = new GoogleClient();
