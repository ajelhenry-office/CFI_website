import jwt from 'jsonwebtoken';
import 'dotenv/config';

const token = jwt.sign({id: 1, email: 'ajel.henry@curefoods.in'}, process.env.JWT_SECRET || 'CurefoodsSuperSecret2026', {expiresIn: '1h'});

fetch('http://localhost:3001/api/timing/bulk-update', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    platform: 'zomato',
    stores: ['Z001'],
    timings: { Monday: { open: true, slots: [{ start: '08:00', end: '23:59' }] } }
  })
})
.then(r => r.json())
.then(d => console.log('RESPONSE:', d))
.catch(e => console.error('ERROR:', e));
