import { q, q1, run, tx, getSetting, setSetting, audit } from './db.js';
import { normalisePhone, HttpError, ValidationError, csv, id, nowIso } from './util.js';

/**
 * Treatwell CSV Import Module
 * Supports customer and booking imports with duplicate detection
 */

function findOrCreateCustomer(input) {
  const phone = normalisePhone(input.phone);
  if (phone.length < 10) throw new ValidationError({ phone: 'Enter a valid phone number' });
  const existing = q1('SELECT * FROM customers WHERE phone = ?', phone);
  if (existing) {
    if (input.firstName) run('UPDATE customers SET first_name = ? WHERE id = ?', input.firstName, existing.id);
    if (input.lastName) run('UPDATE customers SET last_name = ? WHERE id = ?', input.lastName, existing.id);
    if (input.email) run('UPDATE customers SET email = ? WHERE id = ?', input.email, existing.id);
    if (input.dateOfBirth) run('UPDATE customers SET dob = ? WHERE id = ?', input.dateOfBirth, existing.id);
    return q1('SELECT * FROM customers WHERE id = ?', existing.id);
  }
  const cid = id('cus');
  run(`INSERT INTO customers (id,first_name,last_name,phone,email,dob,whatsapp_opt_in,marketing_opt_in,
       consent_at,loyalty_points,total_spend_pence,visit_count,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,0,0,0,?)`,
    cid, input.firstName || 'Guest', input.lastName || '', phone, input.email || '', input.dateOfBirth || null,
    input.whatsappOptIn === false ? 0 : 1, input.marketingOptIn ? 1 : 0, nowIso(), nowIso());
  return q1('SELECT * FROM customers WHERE id = ?', cid);
}

const EXPECTED_CUSTOMER_HEADERS = ['first_name', 'last_name', 'email', 'phone', 'date_of_birth', 'address', 'notes'];
const EXPECTED_BOOKING_HEADERS = ['customer_email', 'customer_phone', 'service_name', 'staff_name', 'start_date', 'start_time', 'duration_minutes', 'status', 'notes'];

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) throw new ValidationError({ file: 'CSV must have header and at least one data row' });
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
    rows.push(row);
  }
  return { headers, rows };
}

function validateCustomerRow(row, rowNum) {
  const errors = {};
  if (!row.first_name?.trim()) errors.first_name = 'required';
  if (!row.phone?.trim()) errors.phone = 'required';
  else {
    const p = normalisePhone(row.phone);
    if (p.length < 10) errors.phone = 'invalid';
  }
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.email = 'invalid';
  if (row.date_of_birth && !/^\d{4}-\d{2}-\d{2}$/.test(row.date_of_birth)) errors.date_of_birth = 'must be YYYY-MM-DD';
  return Object.keys(errors).length ? { row: rowNum, errors } : null;
}

function validateBookingRow(row, rowNum) {
  const errors = {};
  if (!row.customer_phone?.trim() && !row.customer_email?.trim()) {
    errors.customer = 'phone or email required';
  }
  if (!row.service_name?.trim()) errors.service_name = 'required';
  if (!row.start_date?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(row.start_date)) errors.start_date = 'required YYYY-MM-DD';
  if (!row.start_time?.trim() || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.start_time)) errors.start_time = 'required HH:MM';
  if (!row.duration_minutes?.trim() || isNaN(Number(row.duration_minutes))) errors.duration_minutes = 'required number';
  return Object.keys(errors).length ? { row: rowNum, errors } : null;
}

function matchCustomer(row) {
  const phone = row.phone ? normalisePhone(row.phone) : null;
  const email = row.email?.toLowerCase().trim() || null;

  // Exact phone match (primary key)
  if (phone) {
    const exact = q1('SELECT * FROM customers WHERE phone = ?', phone);
    if (exact) return { customer: exact, confidence: 1.0, matchType: 'phone_exact' };
  }

  // Exact email match
  if (email) {
    const exact = q1('SELECT * FROM customers WHERE lower(email) = ?', email);
    if (exact) return { customer: exact, confidence: 0.95, matchType: 'email_exact' };
  }

  // Treatwell ID match
  if (row.treatwell_customer_id) {
    const tw = q1('SELECT * FROM customers WHERE treatwell_customer_id = ?', row.treatwell_customer_id);
    if (tw) return { customer: tw, confidence: 1.0, matchType: 'treatwell_id' };
  }

  // Fuzzy: name + phone partial
  if (phone && row.first_name && row.last_name) {
    const fuzzy = q1(
      `SELECT * FROM customers
       WHERE phone LIKE ? AND lower(first_name) = ? AND lower(last_name) = ?`,
      `%${phone.slice(-7)}%`, row.first_name.toLowerCase(), row.last_name.toLowerCase()
    );
    if (fuzzy) return { customer: fuzzy, confidence: 0.7, matchType: 'name_phone_partial' };
  }

  // Fuzzy: name + email
  if (email && row.first_name && row.last_name) {
    const fuzzy = q1(
      `SELECT * FROM customers
       WHERE lower(email) = ? AND lower(first_name) = ? AND lower(last_name) = ?`,
      email, row.first_name.toLowerCase(), row.last_name.toLowerCase()
    );
    if (fuzzy) return { customer: fuzzy, confidence: 0.8, matchType: 'name_email' };
  }

  return { customer: null, confidence: 0, matchType: 'none' };
}

function findOrCreateService(serviceName) {
  const existing = q1('SELECT * FROM services WHERE lower(name) = ? AND active = 1', serviceName.toLowerCase());
  if (existing) return existing;
  // Create as inactive placeholder for admin to review
  const sid = id('svc');
  run(`INSERT INTO services (id,name,category,description,duration_min,buffer_min,price_pence,deposit_pence,online_bookable,active,sort_order,created_at)
       VALUES (?,?,?,?,?,?,?,?,0,0,99,?)`, sid, serviceName, 'Imported', '', 30, 10, 0, 0, nowIso());
  return q1('SELECT * FROM services WHERE id = ?', sid);
}

function findOrCreateStaff(staffName) {
  if (!staffName) return null;
  const existing = q1('SELECT * FROM staff WHERE lower(name) = ? AND active = 1', staffName.toLowerCase());
  if (existing) return existing;
  // Create as inactive placeholder
  const sid = id('stf');
  run(`INSERT INTO staff (id,name,title,bio,phone,email,colour,employment_type,commission_pct,active,sort_order,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,0,99,?)`, sid, staffName, 'Stylist', '', '', '', '#8B5CF6', 'full_time', 0, nowIso());
  return q1('SELECT * FROM staff WHERE id = ?', sid);
}

export async function importCustomers({ csvText, actor, ip, source = 'csv' }) {
  const { headers, rows } = parseCSV(csvText);
  const missing = EXPECTED_CUSTOMER_HEADERS.filter(h => !headers.includes(h));
  if (missing.length) throw new ValidationError({ headers: `Missing columns: ${missing.join(', ')}` });

  const importId = id('twi');
  const errors = [];
  let created = 0, updated = 0, skipped = 0;
  const mappings = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const validation = validateCustomerRow(row, i + 2);
    if (validation) { errors.push(validation); continue; }

    const match = matchCustomer(row);
    const phone = normalisePhone(row.phone);
    const email = row.email?.toLowerCase().trim() || '';
    const treatwellId = row.treatwell_customer_id || row.id || row.customer_id || '';

    if (match.customer) {
      // Update existing
      const sets = [];
      const params = [];
      if (row.first_name && row.first_name !== match.customer.first_name) { sets.push('first_name = ?'); params.push(row.first_name); }
      if (row.last_name && row.last_name !== match.customer.last_name) { sets.push('last_name = ?'); params.push(row.last_name); }
      if (email && email !== match.customer.email) { sets.push('email = ?'); params.push(email); }
      if (row.date_of_birth && row.date_of_birth !== match.customer.dob) { sets.push('dob = ?'); params.push(row.date_of_birth); }
      if (row.address && row.address !== match.customer.address) { sets.push('address = ?'); params.push(row.address); }
      if (row.notes && row.notes !== match.customer.notes) { sets.push('notes = ?'); params.push(row.notes); }
      if (treatwellId && !match.customer.treatwell_customer_id) { sets.push('treatwell_customer_id = ?'); params.push(treatwellId); }

      if (sets.length) {
        params.push(match.customer.id);
        run(`UPDATE customers SET ${sets.join(', ')} WHERE id = ?`, ...params);
        updated++;
      } else {
        skipped++;
      }

      // Record mapping
      const mappingId = id('twm');
      run(`INSERT INTO treatwell_mappings (id,local_customer_id,treatwell_customer_id,treatwell_email,treatwell_phone,confidence,status,created_at)
           VALUES (?,?,?,?,?,?,?,?)`, mappingId, match.customer.id, treatwellId, email, phone, match.confidence, match.confidence >= 0.9 ? 'confirmed' : 'pending', nowIso());
      mappings.push({ localId: match.customer.id, treatwellId, confidence: match.confidence, status: match.confidence >= 0.9 ? 'confirmed' : 'pending' });
    } else {
      // Create new customer
      const cid = id('cus');
      run(`INSERT INTO customers (id,first_name,last_name,phone,email,dob,address,tags,preferred_staff_id,
           allergies,formula_notes,notes,whatsapp_opt_in,marketing_opt_in,consent_at,loyalty_points,total_spend_pence,
           visit_count,last_visit_at,created_at,treatwell_customer_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,0,?,0,0,0,NULL,?,?)`,
        cid, row.first_name, row.last_name || '', phone, email, row.date_of_birth || null,
        row.address || '', '', null, '', '', row.notes || '', nowIso(), nowIso(), treatwellId);
      created++;

      const mappingId = id('twm');
      run(`INSERT INTO treatwell_mappings (id,local_customer_id,treatwell_customer_id,treatwell_email,treatwell_phone,confidence,status,created_at)
           VALUES (?,?,?,?,?,1.0,'confirmed',?)`, mappingId, cid, treatwellId, email, phone, nowIso());
      mappings.push({ localId: cid, treatwellId, confidence: 1.0, status: 'confirmed' });
    }
  }

  run(`INSERT INTO treatwell_imports (id,type,source,filename,rows_total,rows_created,rows_updated,rows_skipped,errors,status,created_by,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    importId, 'customers', source, 'customers.csv', rows.length, created, updated, skipped, JSON.stringify(errors), 'completed', actor?.id || null, nowIso());

  audit({ actor, action: 'treatwell.import_customers', entity: 'treatwell_import', entityId: importId, detail: `${created} created, ${updated} updated, ${skipped} skipped`, ip });

  return { importId, created, updated, skipped, errors, mappings };
}

export async function importBookings({ csvText, actor, ip, source = 'csv' }) {
  const { headers, rows } = parseCSV(csvText);
  const missing = EXPECTED_BOOKING_HEADERS.filter(h => !headers.includes(h));
  if (missing.length) throw new ValidationError({ headers: `Missing columns: ${missing.join(', ')}` });

  const importId = id('twi');
  const errors = [];
  let created = 0, updated = 0, skipped = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const validation = validateBookingRow(row, i + 2);
    if (validation) { errors.push(validation); continue; }

    // Find customer
    let customer = null;
    if (row.customer_phone) {
      const phone = normalisePhone(row.customer_phone);
      customer = q1('SELECT * FROM customers WHERE phone = ?', phone);
    }
    if (!customer && row.customer_email) {
      customer = q1('SELECT * FROM customers WHERE lower(email) = ?', row.customer_email.toLowerCase());
    }
    if (!customer) {
      errors.push({ row: i + 2, errors: { customer: 'not found in system (import customers first)' } });
      continue;
    }

    // Find service
    const service = findOrCreateService(row.service_name);
    if (!service.active) {
      errors.push({ row: i + 2, errors: { service: `Service "${row.service_name}" not active - requires admin review` } });
      continue;
    }

    // Find staff
    const staff = findOrCreateStaff(row.staff_name);
    if (!staff) {
      errors.push({ row: i + 2, errors: { staff: `Staff "${row.staff_name}" not found` } });
      continue;
    }
    if (!staff.active) {
      errors.push({ row: i + 2, errors: { staff: `Staff "${row.staff_name}" not active - requires admin review` } });
      continue;
    }

    // Check staff has skill for service
    const hasSkill = q1('SELECT 1 FROM staff_skills WHERE staff_id = ? AND service_id = ?', staff.id, service.id);
    if (!hasSkill) {
      errors.push({ row: i + 2, errors: { staff: `Staff "${staff.name}" cannot perform "${service.name}"` } });
      continue;
    }

    // Parse datetime
    const tz = getSetting('salon.timezone') || 'Europe/London';
    const { zonedToUtc } = await import('./util.js');
    const startAt = zonedToUtc(row.start_date, row.start_time, tz).toISOString();
    const duration = Number(row.duration_minutes);
    const buffer = service.buffer_min;
    const endAt = new Date(new Date(startAt).getTime() + (duration + buffer) * 60000).toISOString();

    // Check for existing booking (same customer, service, start time)
    const existing = q1(
      `SELECT * FROM appointments WHERE customer_id = ? AND staff_id = ? AND start_at = ? AND status != 'cancelled'`,
      customer.id, staff.id, startAt
    );

    const treatwellBookingId = row.treatwell_booking_id || row.booking_id || row.id || '';

    if (existing) {
      // Update if treatwell ID matches or if no treatwell ID on existing
      if (treatwellBookingId && existing.treatwell_booking_id === treatwellBookingId) {
        const sets = ['status = ?', 'notes = ?', 'updated_at = ?'];
        const params = [row.status || 'confirmed', row.notes || '', nowIso()];
        if (treatwellBookingId && !existing.treatwell_booking_id) { sets.push('treatwell_booking_id = ?'); params.push(treatwellBookingId); }
        params.push(existing.id);
        run(`UPDATE appointments SET ${sets.join(', ')} WHERE id = ?`, ...params);
        updated++;
      } else {
        skipped++;
      }
    } else {
      // Create new appointment
      const apptId = id('apt');
      const reference = `TW-${Date.now().toString(36).toUpperCase()}`;
      const status = row.status || 'confirmed';
      const totalPence = service.price_pence;
      const depositPence = service.deposit_pence;

      run(`INSERT INTO appointments (id,reference,customer_id,staff_id,start_at,end_at,status,source,total_pence,
           deposit_pence,deposit_method,paid_pence,notes,internal_notes,treatwell_booking_id,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        apptId, reference, customer.id, staff.id, startAt, endAt, status, 'treatwell', totalPence,
        depositPence, '', status === 'completed' ? totalPence : 0, row.notes || '', '', treatwellBookingId, nowIso(), nowIso());

      run(`INSERT INTO appointment_items (id,appointment_id,service_id,name_snapshot,duration_min,price_pence,sort_order)
           VALUES (?,?,?,?,?,?,0)`, id('itm'), apptId, service.id, service.name, service.duration_min, service.price_pence);

      created++;
    }
  }

  run(`INSERT INTO treatwell_imports (id,type,source,filename,rows_total,rows_created,rows_updated,rows_skipped,errors,status,created_by,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    importId, 'bookings', source, 'bookings.csv', rows.length, created, updated, skipped, JSON.stringify(errors), 'completed', actor?.id || null, nowIso());

  audit({ actor, action: 'treatwell.import_bookings', entity: 'treatwell_import', entityId: importId, detail: `${created} created, ${updated} updated, ${skipped} skipped`, ip });

  return { importId, created, updated, skipped, errors };
}

export function listImports({ limit = 50 } = {}) {
  return q('SELECT * FROM treatwell_imports ORDER BY created_at DESC LIMIT ?', limit);
}

export function getImport(importId) {
  return q1('SELECT * FROM treatwell_imports WHERE id = ?', importId);
}

export function listMappings({ status, limit = 200 } = {}) {
  const where = status ? 'WHERE status = ?' : '';
  const params = status ? [status] : [];
  return q(`SELECT tm.*, c.first_name, c.last_name, c.phone, c.email
            FROM treatwell_mappings tm
            JOIN customers c ON c.id = tm.local_customer_id
            ${where}
            ORDER BY tm.created_at DESC LIMIT ?`, ...params, limit);
}

export function confirmMapping(mappingId, { actor, ip } = {}) {
  run('UPDATE treatwell_mappings SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?', 'confirmed', nowIso(), actor?.id || null, mappingId);
  audit({ actor, action: 'treatwell.confirm_mapping', entity: 'treatwell_mapping', entityId: mappingId, ip });
  return q1('SELECT * FROM treatwell_mappings WHERE id = ?', mappingId);
}

export function rejectMapping(mappingId, { actor, ip } = {}) {
  run('UPDATE treatwell_mappings SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?', 'rejected', nowIso(), actor?.id || null, mappingId);
  audit({ actor, action: 'treatwell.reject_mapping', entity: 'treatwell_mapping', entityId: mappingId, ip });
  return q1('SELECT * FROM treatwell_mappings WHERE id = ?', mappingId);
}

export function mergeCustomers(keepId, mergeId, { actor, ip } = {}) {
  if (keepId === mergeId) throw new ValidationError({ mergeId: 'Cannot merge a customer with themselves' });
  const keep = q1('SELECT * FROM customers WHERE id = ?', keepId);
  const merge = q1('SELECT * FROM customers WHERE id = ?', mergeId);
  if (!keep || !merge) throw new HttpError(404, 'not_found', 'Customer not found');

  tx(() => {
    // Reassign appointments
    run('UPDATE appointments SET customer_id = ? WHERE customer_id = ?', keepId, mergeId);
    // Reassign notifications
    run('UPDATE notifications SET customer_id = ? WHERE customer_id = ?', keepId, mergeId);
    // Reassign waitlist
    run('UPDATE waitlist SET customer_id = ? WHERE customer_id = ?', keepId, mergeId);
    // Reassign package purchases
    run('UPDATE package_purchases SET customer_id = ? WHERE customer_id = ?', keepId, mergeId);
    // Reassign treatwell mappings
    run('UPDATE treatwell_mappings SET local_customer_id = ? WHERE local_customer_id = ?', keepId, mergeId);
    // Merge tags
    const allTags = new Set([...(keep.tags || '').split(',').filter(Boolean), ...(merge.tags || '').split(',').filter(Boolean)]);
    run('UPDATE customers SET tags = ? WHERE id = ?', Array.from(allTags).join(','), keepId);
    // Merge notes
    const combinedNotes = [keep.notes, merge.notes].filter(Boolean).join('\n---\n');
    run('UPDATE customers SET notes = ? WHERE id = ?', combinedNotes, keepId);
    // Delete merged customer
    run('DELETE FROM customers WHERE id = ?', mergeId);
  });

  audit({ actor, action: 'customer.merge', entity: 'customer', entityId: keepId, detail: `Merged ${mergeId} into ${keepId}`, ip });
  return q1('SELECT * FROM customers WHERE id = ?', keepId);
}