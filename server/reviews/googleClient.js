import fs from 'fs/promises';
import { google } from 'googleapis';
import 'dotenv/config';

const CREDENTIALS_PATH = process.env.GOOGLE_CREDENTIALS_PATH || './server/reviews/credentials.json';
const TOKEN_PATH = './server/reviews/token.json';

// Safety valve while wiring this up for real: when true (default), replies are
// logged instead of posted to Google. Matches the AUTO_REPLY_ENABLED flag the
// Apps Script bot uses for the same reason.
const DRY_RUN = process.env.REVIEWS_DRY_RUN !== 'false';

class GoogleClient {
  async getAuthClient() {
    const credentials = JSON.parse(await fs.readFile(CREDENTIALS_PATH, 'utf8'));
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    let token;
    try {
      token = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf8'));
    } catch (error) {
      throw new Error("Google Auth Token not found! Run 'node server/reviews/auth.js' to authorize.");
    }

    oAuth2Client.setCredentials(token);
    return oAuth2Client;
  }

  /**
   * Fetches the latest reviews for a specific location.
   * @param {string} locationPath - Full path 'accounts/{accountId}/locations/{locationId}'
   */
  async getLatestReviews(locationPath) {
    const auth = await this.getAuthClient();
    const url = `https://mybusiness.googleapis.com/v4/${locationPath}/reviews?pageSize=50&orderBy=updateTime desc`;

    const response = await auth.request({ url, method: 'GET' });
    return response.data.reviews || [];
  }

  /**
   * Posts a reply to a specific review.
   * @param {string} reviewId - The full review name/id string from Google.
   * @param {string} replyText - The reply text.
   */
  async postReply(reviewId, replyText) {
    if (DRY_RUN) {
      console.log(`[Google API DRY RUN] Would post reply to ${reviewId}: "${replyText}"`);
      return { comment: replyText };
    }

    const auth = await this.getAuthClient();
    const url = `https://mybusiness.googleapis.com/v4/${reviewId}/reply`;

    const response = await auth.request({
      url,
      method: 'PUT',
      data: { comment: replyText },
    });

    return response.data;
  }
}

export const googleClient = new GoogleClient();
