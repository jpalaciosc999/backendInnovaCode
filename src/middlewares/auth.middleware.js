import jwt from "jsonwebtoken";
import { executeQuery } from "../config/db.js";

function normalizePermissionValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function getPermissionValues(permiso) {
  return {
    modulo: permiso.PER_MODULO || permiso.per_modulo || permiso.modulo,
    nombre: permiso.PER_NOMBRE_PERMISO || permiso.per_nombre_permiso || permiso.nombre
  };
}

function moduleMatches(actual, expected) {
  const aliases = {
    admin: ["admin", "administracion", "auditoria"],
    reportes: ["reportes", "gerencia", "auditoria"],
    empleados: ["empleados", "rrhh"],
    nomina: ["nomina", "contabilidad"],
    asistencia: ["asistencia", "rrhh"]
  };
  const actualValue = normalizePermissionValue(actual);
  const expectedValue = normalizePermissionValue(expected);
  const expectedAliases = aliases[expectedValue] || [expectedValue];

  return expectedAliases.includes(actualValue);
}

function hasPermission(usuario, modulo, nombrePermiso) {
  const permisos = Array.isArray(usuario?.permisos) ? usuario.permisos : [];
  const permisoEsperado = normalizePermissionValue(nombrePermiso);

  return permisos.some((permiso) => {
    const values = getPermissionValues(permiso);

    return moduleMatches(values.modulo, modulo) &&
      normalizePermissionValue(values.nombre) === permisoEsperado;
  });
}

async function cargarUsuarioVigente(req) {
  if (req.usuarioVigente) {
    return req.usuarioVigente;
  }

  const usuarioId = Number(req.usuario?.id);

  if (!Number.isFinite(usuarioId)) {
    return null;
  }

  const usuarioResult = await executeQuery(
    `
      SELECT
        u.USU_ID AS "id",
        u.USU_USERNAME AS "username",
        u.USU_NOMBRE_COMPLETO AS "nombre_completo",
        u.USU_CORREO AS "correo",
        u.USU_ESTADO AS "estado",
        u.ROL_ID AS "rol_id",
        u.EMP_ID AS "emp_id",
        r.ROL_NOMBRE AS "rol_nombre",
        r.ROL_NIVEL_ACCESO AS "rol_nivel_acceso",
        r.ROL_ESTADO AS "rol_estado"
      FROM EMP_USUARIO u
      LEFT JOIN EMP_ROLES r ON r.ROL_ID = u.ROL_ID
      WHERE u.USU_ID = :usuario_id
    `,
    { usuario_id: usuarioId }
  );

  if (usuarioResult.rows.length === 0) {
    return null;
  }

  const usuario = usuarioResult.rows[0];

  if (usuario.estado !== "A" || usuario.rol_estado !== "A") {
    return null;
  }

  const permisosResult = await executeQuery(
    `
      SELECT
        p.PERMISOS_ID,
        p.PER_NOMBRE_PERMISO,
        p.PER_MODULO,
        p.PER_DESCRIPCION
      FROM EMP_ROL_PERMISOS rp
      INNER JOIN EMP_PERMISOS p ON p.PERMISOS_ID = rp.PER_ID
      WHERE rp.ROL_ID = :rol_id
      ORDER BY p.PER_MODULO, p.PER_NOMBRE_PERMISO
    `,
    { rol_id: usuario.rol_id }
  );

  req.usuarioVigente = {
    ...usuario,
    rol_nivel_acceso: Number(usuario.rol_nivel_acceso),
    permisos: permisosResult.rows
  };
  req.usuario = req.usuarioVigente;

  return req.usuarioVigente;
}

export function verificarToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      message: "Token no proporcionado"
    });
  }

  const [type, token] = authHeader.split(" ");

  if (type !== "Bearer" || !token) {
    return res.status(401).json({
      message: "Formato de token invalido"
    });
  }

  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({
      message: "Token invalido o expirado"
    });
  }
}

export function requierePermiso(modulo, nombrePermiso) {
  return async (req, res, next) => {
    try {
      const usuario = await cargarUsuarioVigente(req);

      if (!usuario || !hasPermission(usuario, modulo, nombrePermiso)) {
        return res.status(403).json({
          message: "No tiene permisos para realizar esta accion"
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({
        message: "Error validando permisos",
        error: error.message
      });
    }
  };
}

export function requiereAlgunoPermiso(...permisosRequeridos) {
  return async (req, res, next) => {
    try {
      const usuario = await cargarUsuarioVigente(req);
      const autorizado = permisosRequeridos.some(({ modulo, permiso }) => {
        return hasPermission(usuario, modulo, permiso);
      });

      if (!usuario || !autorizado) {
        return res.status(403).json({
          message: "No tiene permisos para realizar esta accion"
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({
        message: "Error validando permisos",
        error: error.message
      });
    }
  };
}

export function requiereRolVigente() {
  return async (req, res, next) => {
    try {
      const usuario = await cargarUsuarioVigente(req);

      if (!usuario) {
        return res.status(403).json({
          message: "No tiene permisos para realizar esta accion"
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({
        message: "Error validando usuario",
        error: error.message
      });
    }
  };
}
