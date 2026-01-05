# Cash & Reconciliation Module

MVP reconciliation module for matching bank/credit card statements to QBO transactions.

## Troubleshooting

### JSON Parse Error During Dev Startup

If you see a `SyntaxError: Expected ',' or '}' after property value in JSON` during Next.js dev startup:

1. **Clear corrupted build cache:**
   ```bash
   cd web
   rm -rf .next
   npm run dev
   ```

2. **Clear corrupted localStorage (if error persists):**
   - Open browser DevTools Console
   - Run: `localStorage.clear()`
   - Refresh the page

3. **The code now includes defensive error handling:**
   - All `JSON.parse` calls are wrapped in try-catch
   - Large or corrupted localStorage entries are automatically cleared
   - API responses are validated before parsing

The error was caused by corrupted localStorage data or Next.js build manifests. The defensive code now prevents this from blocking the app.

## Features

- **CSV Upload**: Upload bank or credit card statements via CSV
- **Automatic Matching**: Match statement lines to QBO transactions by amount, date, and description
- **Review Queue**: Review unmatched/ambiguous lines and take actions (ignore, mark receipt received)

## Database Schema

Tables created in `api/src/db/schema.ts`:
- `recon_statements`: Uploaded statements metadata
- `recon_statement_lines`: Individual transaction lines from statements

## API Endpoints

All endpoints under `/api/recon/*`:

- `POST /api/recon/statements/upload` - Upload CSV statement
- `GET /api/recon/statements` - List statements
- `GET /api/recon/lines` - List statement lines (with optional filters)
- `POST /api/recon/match/run` - Run matching against QBO
- `POST /api/recon/lines/:id/ignore` - Mark line as ignored
- `POST /api/recon/lines/:id/attach-receipt` - Mark receipt received (CC only)

## CSV Format

### Bank Statement
```csv
Date,Description,Amount
09/01/2025,CHASE BANK DEPOSIT #1234,1000.00
09/02/2025,ACH TRANSFER FROM,500.00
09/03/2025,CHECK #5678,-250.00
```

### Credit Card Statement
```csv
Date,Merchant,Amount,HasReceipt
09/01/2025,AMAZON.COM,-45.99,true
09/02/2025,STARBUCKS STORE,-5.50,false
09/03/2025,UBER TRIP,-12.75,true
```

## Testing

### Generate Sample CSV Files

```bash
cd api
npm run gen-recon-csv
```

Output files:
- `api/scripts/output/bank_statement_sample.csv`
- `api/scripts/output/cc_statement_sample.csv`

### Test Upload (curl)

```bash
# Upload bank statement
curl -X POST http://localhost:8080/api/recon/statements/upload \
  -F "file=@api/scripts/output/bank_statement_sample.csv" \
  -F "orgId=YOUR_ORG_ID" \
  -F "kind=bank" \
  -F "periodFrom=2025-09-01" \
  -F "periodTo=2025-11-30" \
  -F "accountName=Chase Checking" \
  -F "accountLast4=1234"

# List statements
curl "http://localhost:8080/api/recon/statements?orgId=YOUR_ORG_ID"

# Run matching
curl -X POST http://localhost:8080/api/recon/match/run \
  -H "Content-Type: application/json" \
  -d '{
    "orgId": "YOUR_ORG_ID",
    "kind": "bank",
    "periodFrom": "2025-09-01",
    "periodTo": "2025-11-30"
  }'
```

## Web UI

Access at: `http://localhost:3010/recon`

Three tabs:
1. **Upload**: Upload CSV statements
2. **Match**: Run matching against QBO transactions
3. **Review**: Review and act on unmatched lines

## Matching Algorithm

Simple scoring approach:
- **Amount match** (exact = 0.5, within 1% = 0.4)
- **Date match** (exact = 0.4, within 3 days = 0.3)
- **Description similarity** (contains match = 0.1)

Minimum score for match: 0.7
- Single match ≥ 0.8: Mark as "matched"
- Multiple matches ≥ 0.7: Mark as "ambiguous"
- Otherwise: Leave as "unmatched"

## Future Enhancements

- Manual match UI (link line to QBO transaction)
- Create missing journal entries
- Receipt file upload
- Better description matching (fuzzy, ML)
- Account-specific matching (match to specific bank/CC accounts in QBO)

