# Cron Job Setup and Limitations

## Current Configuration

The cron job is configured in `vercel.json` with the following schedule:
```json
{
  "path": "/api/cron",
  "schedule": "* * * * *"
}
```

## Schedule Explanation

- `* * * * *` = Every minute
- This is the **minimum interval** supported by Vercel cron jobs
- **15-second intervals are NOT supported** by Vercel's cron system

## Vercel Cron Limitations

### Supported Intervals
- **Minimum**: Every minute (`* * * * *`)
- **Maximum**: Custom schedules up to once per year
- **Format**: Standard cron format (5 fields: minute, hour, day, month, day-of-week)

### NOT Supported
- Sub-minute intervals (like every 15 seconds)
- Seconds field in cron expressions (6-field format)

## Current Implementation

The cron job at `/api/cron` is designed to:
1. **Process multiple tasks per execution** to compensate for the 1-minute minimum
2. **Handle up to 3 tasks per run** to avoid timeout
3. **Maintain persistent state** between executions using MongoDB
4. **Queue tasks efficiently** to process them across multiple cron runs

## Alternative Solutions for Higher Frequency

If you need higher frequency than every minute:

### Option 1: Self-hosted Solution
- Deploy to a VPS or cloud server
- Use system cron with `*/15 * * * * *` (every 15 seconds)
- Requires maintaining your own server

### Option 2: Multiple Vercel Functions
- Create multiple cron endpoints (`/api/cron1`, `/api/cron2`, etc.)
- Stagger their schedules by seconds (not possible with Vercel)
- **Not recommended** - would still be limited to 1-minute intervals

### Option 3: Webhook-based Processing
- Use external service to trigger webhooks more frequently
- Services like Zapier, IFTTT, or AWS Lambda with CloudWatch Events
- More complex setup but allows sub-minute processing

## Current Status

✅ **Working**: Cron job runs every minute and processes pending NFT generation tasks
✅ **Efficient**: Handles multiple tasks per execution to maximize throughput
✅ **Persistent**: Uses MongoDB to maintain state between executions
✅ **Robust**: Comprehensive error handling and logging

## Monitoring

You can monitor cron job execution by:
1. **Vercel Dashboard**: Check function logs and invocations
2. **MongoDB**: Check task status and completion rates
3. **Health Endpoint**: `/api/health` shows system status
4. **Direct Cron Check**: Visit `/api/cron` to manually trigger execution

## Performance Optimization

The current setup is optimized for Vercel's 1-minute cron limitation by:
- Processing multiple tasks per execution
- Maintaining persistent queues
- Efficient blockchain event scanning
- Timeout protection to prevent hanging executions