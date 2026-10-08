export const publicUserSelect = {
  uid: true,
  username: true,
  fullname: true,
  role: { select: { rolename: true } },
  membership: { select: { mname: true, score: true } },
};

export function validateCredentials(body, registration = false) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const allowed = registration ? ['username', 'fullname', 'password'] : ['username', 'password'];
  if (Object.keys(body).some(key => !allowed.includes(key))) return null;
  if (typeof body.username !== 'string' || typeof body.password !== 'string') return null;
  const username = body.username.trim();
  const password = body.password;
  if (!/^[a-zA-Z0-9_]{3,50}$/.test(username)) return null;
  if (password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) return null;
  if (!registration) return { username, password };
  if (typeof body.fullname !== 'string') return null;
  const fullname = body.fullname.trim();
  if (!fullname || [...fullname].length > 100) return null;
  return { username, password, fullname };
}
