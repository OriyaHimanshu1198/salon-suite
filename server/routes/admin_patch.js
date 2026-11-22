adminRouter.get('/customers/:id/packages', (req, res) => {
  res.json({ purchases: customerPackages(req.params.id) });
});

/* ══ Treatment Verification (QR) ═════════════════════════════════════════ */

// Verify customer by QR code and show eligible packages
adminRouter.get('/verify/qr/:qrCode', (req, res) => {
  const customer = q1('SELECT * FROM customers WHERE qr_code = ?', req.params.qrCode);
  if (!customer) throw new HttpError(404, 'not_found', 'Invalid QR code');
  const packages = usablePurchases(customer.id);
  res.json({ customer, packages });
});

// Verify and redeem a treatment via QR
adminRouter.post('/verify/qr/:qrCode/redeem', canDesk, (req, res) => {
  const { purchaseId, appointmentId, note = '' } = req.body || {};
  if (!purchaseId) throw new ValidationError({ purchaseId: 'required' });
  const customer = q1('SELECT * FROM customers WHERE qr_code = ?', req.params.qrCode);
  if (!customer) throw new HttpError(404, 'not_found', 'Invalid QR code');
  const purchase = q1('SELECT * FROM package_purchases WHERE id = ? AND customer_id = ?', purchaseId, customer.id);
  if (!purchase) throw new HttpError(404, 'not_found', 'Package not found for this customer');
  const out = redeemSession({ purchaseId, appointmentId, note, actor: req.user, ip: req.ip });
  res.json(out);
});

/* ══ reviews ════════════════════════════════════════════════════════ */

adminRouter.get('/reviews', (req, res) => {
  res.json({
    reviews: q('SELECT * FROM reviews ORDER BY sort_order, reviewed_at DESC'),
    googleUrl: getSetting('reviews.google_url') || '',
    configured: Boolean(process.env.GOOGLE_PLACES_API_KEY && getSetting('reviews.google_place_id')),
  });
});

adminRouter.post('/reviews', canManage, (req, res) => {
  const body = req.body || {};
  requireFields(body, { author: { required: true, maxLen: 80 } });
  const reviewId = id('rev');
  run(`INSERT INTO reviews (id,author,rating,body,source,reviewed_at,featured,sort_order,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    reviewId, body.author, Math.min(5, Math.max(1, Number(body.rating) || 5)),
    String(body.body || '').slice(0, 1000), body.source || 'google', body.reviewedAt || todayIn(tz()),
    body.featured === false ? 0 : 1, Number(body.sortOrder) || 0, nowIso());
  audit({ actor: req.user, action: 'review.create', entity: 'review', entityId: reviewId, detail: body.author, ip: req.ip });
  res.status(201).json({ review: q1('SELECT * FROM reviews WHERE id = ?', reviewId) });
});

adminRouter.patch('/reviews/:id', canManage, (req, res) => {
  const body = req.body || {};
  const existing = q1('SELECT * FROM reviews WHERE id = ?', req.params.id);
  if (!existing) throw new HttpError(404, 'not_found', 'Review not found');
  const map = {
    author: 'author', rating: 'rating', body: 'body', source: 'source',
    reviewedAt: 'reviewed_at', sortOrder: 'sort_order',
  };
  const sets = []; const params = [];
  for (const [key, col] of Object.entries(map)) {
    if (body[key] !== undefined) { sets.push(`${col} = ?`); params.push(body[key]); }
  }
  if (body.featured !== undefined) { sets.push('featured = ?'); params.push(body.featured ? 1 : 0); }
  if (sets.length) { params.push(req.params.id); run(`UPDATE reviews SET ${sets.join(', ')} WHERE id = ?`, ...params); }
  audit({ actor: req.user, action: 'review.update', entity: 'review', entityId: req.params.id, ip: req.ip });
  res.json({ review: q1('SELECT * FROM reviews WHERE id = ?', req.params.id) });
});

adminRouter.delete('/reviews/:id', canManage, (req, res) => {
  run('DELETE FROM reviews WHERE id = ?', req.params.id);
  audit({ actor: req.user, action: 'review.delete', entity: 'review', entityId: req.params.id, ip: req.ip });
  res.json({ ok: true });
});

adminRouter.post('/reviews/sync', canManage, async (req, res, next) => {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = getSetting('reviews.google_place_id');
  if (!key || !placeId) {
    return res.json({
      synced: 0, configured: false,
      message: 'Add GOOGLE_PLACES_API_KEY to .env and the Google place ID in Settings to sync. Curated reviews are still shown.',
    });
  }
  try {
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
    const r = await fetch(url, {
      headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'reviews,rating,userRatingCount' },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new HttpError(502, 'google_error', data?.error?.message || `Google Places ${r.status}`);
    let synced = 0;
    for (const rev of data.reviews || []) {
      const author = rev.authorAttribution?.displayName || 'Google user';
      const text = rev.text?.text || '';
      const rating = Math.min(5, Math.max(1, Number(rev.rating) || 5));
      const when = rev.publishTime ? String(rev.publishTime).slice(0, 10) : todayIn(tz());
      const existing = q1('SELECT * FROM reviews WHERE source = ? AND author = ? AND body = ?', 'google', author, text);
      if (existing) {
        run('UPDATE reviews SET rating = ?, reviewed_at = ? WHERE id = ?', rating, when, existing.id);
        continue;
      }
      run(`INSERT INTO reviews (id,author,rating,body,source,reviewed_at,featured,sort_order,created_at)
           VALUES (?,?,?,?, 'google', ?, 1, 99, ?)`, id('rev'), author, rating, text, when, nowIso());
      synced += 1;
    }
    audit({ actor: req.user, action: 'review.sync', entity: 'review', detail: `${synced} new`, ip: req.ip });
    res.json({ synced, configured: true, average: data.rating || null, total: data.userRatingCount || 0 });
  } catch (err) {
    next(err);
  }
});

/* ══ staff sales & birthdays ═════════════════════════════════════════════ */