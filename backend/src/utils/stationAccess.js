// =============================================================================
// Station helpers — multi-tenant access control
// =============================================================================

function isAdmin(user) {
  return user?.role === 'admin';
}

function canAccessStation(station, user) {
  if (!station || !user) return false;
  if (isAdmin(user)) return true;
  return station.owner_id === user.id;
}

function ownerFilterClause(user, startParam = 1) {
  if (isAdmin(user)) return { sql: '', params: [] };
  return { sql: ` AND s.owner_id = $${startParam}`, params: [user.id] };
}

module.exports = { isAdmin, canAccessStation, ownerFilterClause };
