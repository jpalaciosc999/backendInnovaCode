export function getActorAccessLevel(req) {
  const level = Number(req.usuario?.rol_nivel_acceso);
  return Number.isFinite(level) ? level : null;
}

export function canManageRoleLevel(req, roleLevel) {
  const actorLevel = getActorAccessLevel(req);
  const targetLevel = Number(roleLevel);

  return Number.isFinite(actorLevel) &&
    Number.isFinite(targetLevel) &&
    targetLevel > actorLevel;
}

export function isCurrentUser(req, usuarioId) {
  return Number(req.usuario?.id) === Number(usuarioId);
}

export function isCurrentRole(req, rolId) {
  return Number(req.usuario?.rol_id) === Number(rolId);
}
