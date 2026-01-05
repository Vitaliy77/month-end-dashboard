# Accruals Module Documentation

## Overview

The Accruals module automatically detects recurring vendor/account expenses that are missing in the current period by analyzing the last 6 months of historical data. It generates high-confidence accrual candidates that can be reviewed, approved, and posted as Journal Entries to QuickBooks Online.

## Features

- **Automatic Detection**: Analyzes P&L reports from the last 6 months to identify recurring expenses
- **Confidence Scoring**: Each candidate includes a confidence score (0.0-1.0) based on consistency and history
- **Review & Approval**: Review candidates, approve or reject them
- **Push to QBO**: Post approved accruals as Journal Entries to QuickBooks Online
- **History Tracking**: View all accrual candidates, approvals, and postings

## Database Schema

The accruals module uses three main tables:

### `accrual_candidates`
Stores detected accrual candidates for each org/period:
- `id`: Unique candidate ID
- `org_id`: Organization ID
- `period_from_date`, `period_to_date`: Period being analyzed
- `vendor_name`: Vendor name (if extractable)
- `account_id`, `account_name`: Expense account
- `expected_amount`: Expected accrual amount
- `confidence_score`: Confidence score (0.0-1.0)
- `explanation_json`: JSON explanation of why this candidate was detected
- `status`: `pending`, `approved`, or `rejected`

### `accrual_approvals`
Tracks approval/rejection decisions:
- `id`: Unique approval ID
- `candidate_id`: Reference to accrual_candidates
- `org_id`: Organization ID
- `approved_by`: User who made the decision (optional)
- `decision`: `approved` or `rejected`
- `notes`: Optional notes
- `created_at`: Timestamp

### `qbo_postings`
Tracks QBO Journal Entry postings:
- `id`: Unique posting ID
- `candidate_id`: Reference to accrual_candidates
- `org_id`: Organization ID
- `journal_entry_id`: QBO Journal Entry ID (if successful)
- `posting_status`: `pending`, `success`, or `error`
- `error_message`: Error details (if failed)
- `posted_at`: Timestamp when posted

## API Endpoints

All endpoints are under `/api/accruals/*`:

### `POST /api/accruals/detect`
Detect accrual candidates for a period.

**Request:**
```json
{
  "orgId": "org-uuid",
  "from": "2025-12-01",
  "to": "2025-12-31"
}
```

**Response:**
```json
{
  "ok": true,
  "candidatesCount": 5,
  "candidates": [...]
}
```

### `GET /api/accruals/candidates`
Get accrual candidates for a period.

**Query Parameters:**
- `orgId`: Organization ID
- `from`: Period start date (YYYY-MM-DD)
- `to`: Period end date (YYYY-MM-DD)

**Response:**
```json
{
  "ok": true,
  "candidates": [...]
}
```

### `POST /api/accruals/:candidateId/approve`
Approve or reject a candidate.

**Request:**
```json
{
  "orgId": "org-uuid",
  "decision": "approved",  // or "rejected"
  "approvedBy": "user@example.com",  // optional
  "notes": "Looks correct"  // optional
}
```

### `POST /api/accruals/:candidateId/push`
Push an approved accrual to QBO as a Journal Entry.

**Request:**
```json
{
  "orgId": "org-uuid"
}
```

**Response:**
```json
{
  "ok": true,
  "journalEntryId": "123",
  "error": null
}
```

**Note:** This endpoint is idempotent. If the candidate was already posted, it returns the existing Journal Entry ID without creating a duplicate.

### `GET /api/accruals/history`
Get accrual history for an organization.

**Query Parameters:**
- `orgId`: Organization ID
- `limit`: Maximum number of records (default: 50)

## Detection Algorithm

The detection algorithm uses a high-confidence heuristic:

1. **Historical Analysis**: Fetches P&L reports for the last 6 months before the current period
2. **Expense Extraction**: Extracts all expense accounts with negative amounts
3. **Pattern Recognition**: Identifies accounts that appear consistently in historical data
4. **Missing Detection**: Compares current period expenses to historical averages
5. **Confidence Scoring**: Calculates confidence based on:
   - Number of months with history (more = higher confidence)
   - Consistency of amounts
   - Presence of vendor name
   - Amount size (larger amounts more likely to be recurring)

**Confidence Threshold**: Only candidates with confidence >= 0.7 are included.

**Minimum Amount**: Only expenses >= $50 are considered.

## Journal Entry Structure

When an accrual is pushed to QBO, a Journal Entry is created with:

- **Date**: Period end date
- **Line 1 (Debit)**: Expense account (the account that was missing)
- **Line 2 (Credit)**: Accrued Liabilities account (or Accounts Payable if no Accrued Liabilities account exists)
- **Amount**: Expected accrual amount
- **Memo**: Explanation of the accrual

**Note**: The system attempts to find an "Accrued Liabilities" account (AccountType: "Other Current Liability"). If not found, it uses "Accounts Payable". If neither exists, the posting will fail with a clear error message.

## Running Locally

### 1. Start the API Server

```bash
cd api
npm install
npm run dev
```

The API will start on `http://localhost:8080`.

### 2. Start the Web App

```bash
cd web
npm install
npm run dev
```

The web app will start on `http://localhost:3010`.

### 3. Access Accruals Page

Navigate to `http://localhost:3010/accruals` in your browser.

## Recomputing Accrual Candidates

To recompute accrual candidates for a period:

1. **Via Web UI:**
   - Navigate to the Accruals page
   - Select org and period
   - Click "Detect Candidates" button
   - Review results in the "Review" tab

2. **Via API:**
   ```bash
   curl -X POST http://localhost:8080/api/accruals/detect \
     -H "Content-Type: application/json" \
     -d '{
       "orgId": "your-org-id",
       "from": "2025-12-01",
       "to": "2025-12-31"
     }'
   ```

**Note**: Re-running detection for the same org/period will replace existing candidates (delete old ones and insert new ones).

## Testing Push-to-QBO in Sandbox

### Prerequisites

1. **QBO Sandbox Company**: Create a sandbox company in the Intuit Developer Portal
2. **Accrued Liabilities Account**: Ensure your sandbox company has an "Accrued Liabilities" account (or "Accounts Payable")
3. **Historical Data**: Your sandbox company should have at least 6 months of expense transactions

### Steps

1. **Connect QBO**: Use the "Connect QBO" button to connect your sandbox company
2. **Detect Candidates**: Run detection for a period that has missing recurring expenses
3. **Review Candidates**: Review the detected candidates in the "Review" tab
4. **Approve Candidate**: Click "Approve" on a candidate you want to test
5. **Push to QBO**: Click "Push to QBO" button
6. **Verify in QBO**: Log into your QBO sandbox company and verify the Journal Entry was created:
   - Go to Accounting → Journal Entries
   - Find the entry with the date matching your period end date
   - Verify the debit/credit amounts match the expected accrual

### Testing Idempotency

To test that push-to-QBO is idempotent (no duplicates):

1. Push a candidate to QBO (should succeed)
2. Push the same candidate again (should return existing Journal Entry ID, not create duplicate)
3. Verify in QBO that only one Journal Entry exists

### Common Issues

**Error: "No Accrued Liabilities or Accounts Payable account found"**
- **Solution**: Create an "Accrued Liabilities" account in QBO (Account Type: "Other Current Liability")

**Error: "QBO request failed (400)"**
- **Solution**: Check that the expense account ID is valid and the period dates are correct

**No candidates detected**
- **Solution**: Ensure your QBO company has at least 6 months of historical expense data

## Troubleshooting

### Detection returns no candidates

- Check that your QBO company has historical expense data (last 6 months)
- Verify the period dates are correct
- Check API logs for errors: `cd api && npm run dev` (logs will show detection progress)

### Push-to-QBO fails

- Verify QBO connection is active (check `/api/health` and QBO connection status)
- Ensure "Accrued Liabilities" or "Accounts Payable" account exists in QBO
- Check API logs for detailed error messages
- Verify the expense account ID is valid in QBO

### Candidates have low confidence scores

- The algorithm requires consistent historical data
- Accounts that appear in fewer than 3 months may have lower confidence
- Very small amounts (< $50) are excluded

## Future Enhancements

- Configurable confidence thresholds per org
- Custom liability account mapping per org
- Support for multiple accrual patterns (monthly, quarterly, etc.)
- Bulk approve/reject actions
- Email notifications for high-confidence candidates
- Integration with approval workflows

