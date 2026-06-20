# Deployment Guide - Innlegg

## Pre-Deployment Checklist

Before deploying to production, ensure all items are complete:

- [ ] All 280 tests passing locally
- [ ] Environment variables configured in Vercel
- [ ] Database migrations applied
- [ ] OAuth redirect URI configured for production domain
- [ ] Stripe keys configured (test or production)
- [ ] SendGrid API key configured
- [ ] Google Analytics ID configured
- [ ] Sentry DSN configured
- [ ] Security headers verified
- [ ] CSP policy updated for production domain
- [ ] Mobile responsiveness tested
- [ ] Performance optimized (bundle size < 500KB)

---

## Environment Variables

### Required Variables

```bash
# Database
DATABASE_URL=mysql://user:password@host/database

# OAuth
VITE_APP_ID=your_app_id
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://portal.manus.im
JWT_SECRET=your_jwt_secret

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Email
SENDGRID_API_KEY=SG.xxx
SENDGRID_FROM_EMAIL=noreply@innlegg.no

# Analytics
VITE_ANALYTICS_WEBSITE_ID=your_analytics_id
VITE_ANALYTICS_ENDPOINT=https://analytics.example.com

# LLM & APIs
OPENAI_API_KEY=sk-...
HUGGINGFACE_API_KEY=hf_...
BUILT_IN_FORGE_API_KEY=your_key
BUILT_IN_FORGE_API_URL=https://api.manus.im

# Owner Info
OWNER_NAME=Your Name
OWNER_OPEN_ID=your_open_id
```

### Optional Variables

```bash
# Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token

# Ayrshare (Social Media Publishing)
AYRSHARE_API_KEY=your_key

# Google Trends
GOOGLE_TRENDS_API_KEY=your_key
```

---

## Deployment Steps

### 1. Prepare for Deployment

```bash
# Verify all tests pass
pnpm test

# Build the project
pnpm build

# Check bundle size
npm run build:analyze
```

### 2. Configure Vercel

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel Settings → Environment Variables
3. Configure production domain
4. Set build command: `pnpm build`
5. Set start command: `pnpm start`

### 3. Database Setup

```bash
# Push database schema to production
pnpm db:push

# Run database optimization
node server/scripts/optimizeDatabase.ts
```

### 4. Deploy to Vercel

```bash
# Deploy from git (automatic)
# OR deploy manually
vercel deploy --prod
```

### 5. Post-Deployment Verification

- [ ] Check production URL is accessible
- [ ] Verify OAuth login works
- [ ] Test Stripe payment flow
- [ ] Verify email notifications send
- [ ] Check analytics tracking
- [ ] Monitor error logs in Sentry
- [ ] Test mobile responsiveness
- [ ] Verify CSP headers

---

## Production Optimization

### 1. Database Optimization

```bash
# Add indexes for better performance
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_platform ON posts(platform);
CREATE INDEX idx_posts_created_at ON posts(created_at);
CREATE INDEX idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX idx_support_tickets_status ON support_tickets(status);
```

### 2. Enable Caching

The application includes built-in caching for:
- User subscriptions (5 min TTL)
- User preferences (10 min TTL)
- Trending topics (1 hour TTL)

### 3. Monitor Performance

Set up monitoring for:
- API response times (target: < 200ms p95)
- Database query times (target: < 500ms p95)
- Error rates (target: < 0.5%)
- Frontend bundle size (target: < 500KB gzipped)

---

## Rollback Procedure

If deployment fails:

1. **Immediate Rollback**
   ```bash
   vercel rollback
   ```

2. **Check Vercel Dashboard**
   - Go to Deployments
   - Select previous stable version
   - Click "Promote to Production"

3. **Verify Rollback**
   - Test production URL
   - Verify database is still accessible
   - Check error logs

---

## Monitoring & Maintenance

### Daily Checks

- [ ] Check error rates in Sentry
- [ ] Monitor API response times
- [ ] Review user feedback
- [ ] Check database performance

### Weekly Tasks

- [ ] Review analytics data
- [ ] Check support tickets
- [ ] Monitor security alerts
- [ ] Update dependencies (if needed)

### Monthly Tasks

- [ ] Review performance metrics
- [ ] Optimize slow queries
- [ ] Update security policies
- [ ] Plan feature releases

---

## Troubleshooting

### OAuth Redirect URI Mismatch

**Problem:** Error 400: redirect_uri_mismatch

**Solution:**
1. Check production domain in Vercel
2. Update OAuth redirect URI to: `https://your-domain.com/api/oauth/callback`
3. Verify in Manus OAuth settings

### Database Connection Issues

**Problem:** Database connection timeout

**Solution:**
1. Check DATABASE_URL is correct
2. Verify database server is running
3. Check connection pool settings
4. Review database logs

### Email Not Sending

**Problem:** SendGrid emails not delivered

**Solution:**
1. Verify SENDGRID_API_KEY is set
2. Check SENDGRID_FROM_EMAIL is valid
3. Review SendGrid dashboard for errors
4. Check email logs in application

### High Response Times

**Problem:** API responses taking > 1s

**Solution:**
1. Check database indexes are created
2. Review slow query logs
3. Enable response caching
4. Optimize N+1 queries
5. Consider database scaling

---

## Security Checklist

- [ ] All secrets are in environment variables (not in code)
- [ ] HTTPS is enforced
- [ ] CORS is properly configured
- [ ] Rate limiting is enabled
- [ ] SQL injection protection is active
- [ ] XSS protection is enabled
- [ ] CSRF tokens are used
- [ ] Security headers are set
- [ ] Regular security audits scheduled

---

## Scaling Considerations

As the application grows:

1. **Database Scaling**
   - Monitor connection pool usage
   - Consider read replicas for analytics queries
   - Archive old data regularly

2. **API Scaling**
   - Monitor response times
   - Consider caching layer (Redis)
   - Implement rate limiting

3. **Frontend Optimization**
   - Monitor bundle size
   - Implement code splitting
   - Use CDN for static assets

4. **Infrastructure**
   - Monitor CPU/memory usage
   - Set up auto-scaling if needed
   - Plan for traffic spikes

---

## Support & Escalation

For deployment issues:

1. **Check Logs**
   - Vercel build logs
   - Sentry error logs
   - Application logs

2. **Common Issues**
   - See Troubleshooting section above
   - Check GitHub issues
   - Review documentation

3. **Get Help**
   - Contact Vercel support
   - Check Manus documentation
   - Review application README
