import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { executeQuery } from "../../config/db.js";

async function getPermisosByRol(rolId) {
  const result = await executeQuery(
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
    { rol_id: rolId }
  );

  return result.rows;
}

async function getUsuarioVigenteById(usuarioId) {
  const result = await executeQuery(
    `
      SELECT
        u.USU_ID              AS "id",
        u.USU_USERNAME        AS "username",
        u.USU_PASSWORD        AS "password",
        u.USU_NOMBRE_COMPLETO AS "nombre_completo",
        u.USU_CORREO          AS "correo",
        u.USU_ESTADO          AS "estado",
        u.ROL_ID              AS "rol_id",
        u.EMP_ID              AS "emp_id",
        r.ROL_NOMBRE          AS "rol_nombre",
        r.ROL_NIVEL_ACCESO    AS "rol_nivel_acceso",
        r.ROL_ESTADO          AS "rol_estado"
      FROM EMP_USUARIO u
      LEFT JOIN EMP_ROLES r ON r.ROL_ID = u.ROL_ID
      WHERE u.USU_ID = :usuario_id
    `,
    { usuario_id: usuarioId }
  );

  return result.rows[0] || null;
}

function createSessionPayload(usuario, permisos) {
  return {
    id: usuario.id,
    username: usuario.username,
    nombre_completo: usuario.nombre_completo,
    correo: usuario.correo,
    rol_id: usuario.rol_id,
    rol_nombre: usuario.rol_nombre,
    rol_nivel_acceso: usuario.rol_nivel_acceso,
    emp_id: usuario.emp_id,
    permisos
  };
}

export async function login(req, res) {
  try {
    const { username, correo, password } = req.body;
    const login = String(username || correo || "").trim();

    if (!login || !password) {
      return res.status(400).json({
        message: "Usuario y contraseña son obligatorios"
      });
    }

    const sql = `
      SELECT
        u.USU_ID              AS "id",
        u.USU_USERNAME        AS "username",
        u.USU_PASSWORD        AS "password",
        u.USU_NOMBRE_COMPLETO AS "nombre_completo",
        u.USU_CORREO          AS "correo",
        u.USU_ESTADO          AS "estado",
        u.ROL_ID              AS "rol_id",
        u.EMP_ID              AS "emp_id",
        r.ROL_NOMBRE          AS "rol_nombre",
        r.ROL_NIVEL_ACCESO    AS "rol_nivel_acceso",
        r.ROL_ESTADO          AS "rol_estado"
      FROM EMP_USUARIO u
      LEFT JOIN EMP_ROLES r ON r.ROL_ID = u.ROL_ID
      WHERE LOWER(u.USU_USERNAME) = LOWER(:login)
         OR LOWER(u.USU_CORREO) = LOWER(:login)
    `;

    const result = await executeQuery(sql, { login });

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Credenciales incorrectas" });
    }

    const usuario = result.rows[0];

    if (usuario.estado !== "A" || usuario.rol_estado !== "A") {
      return res.status(403).json({ message: "Usuario inactivo" });
    }

    let passwordValida = false;

    if (usuario.password.startsWith("$2")) {
      passwordValida = await bcrypt.compare(password, usuario.password);
    } else {
      passwordValida = password === usuario.password;
    }

    if (!passwordValida) {
      return res.status(401).json({ message: "Credenciales incorrectas" });
    }

    const permisos = await getPermisosByRol(usuario.rol_id);
    const payload = createSessionPayload(usuario, permisos);

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "2h"
    });

    res.json({
      message: "Login correcto",
      token,
      expiresIn: process.env.JWT_EXPIRES_IN || "2h",
      usuario: {
        ...payload
      }
    });

  } catch (error) {
    res.status(500).json({
      message: "Error iniciando sesión",
      error: error.message
    });
  }
}

export async function readToken(req, res) {
  try {
    const { token } = req.body || {};

    if (!token) {
      return res.status(400).json({
        message: "Token requerido"
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const usuario = await getUsuarioVigenteById(decoded.id);

    if (!usuario || usuario.estado !== "A" || usuario.rol_estado !== "A") {
      return res.status(403).json({
        valido: false,
        message: "Usuario o rol inactivo"
      });
    }

    const permisos = await getPermisosByRol(usuario.rol_id);
    const payload = createSessionPayload(usuario, permisos);
    const refreshedToken = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "2h"
    });

    // Tiempos
    const refreshedDecoded = jwt.decode(refreshedToken);
    const fechaExp = new Date(refreshedDecoded.exp * 1000);
    const fechaIat = new Date(refreshedDecoded.iat * 1000);

    const tiempoRestanteSeg = refreshedDecoded.exp - Math.floor(Date.now() / 1000);

    const minutos = Math.floor(tiempoRestanteSeg / 60);
    const segundos = tiempoRestanteSeg % 60;

    res.json({
      valido: true,
      token: refreshedToken,
      usuario: payload,
      token_info: {
        emitido_en: fechaIat.toLocaleString(),
        expira_en: fechaExp.toLocaleString(),
        tiempo_restante: `${minutos} min ${segundos} seg`
      }
    });

  } catch (error) {
    return res.status(401).json({
      valido: false,
      message: "Token inválido o expirado"
    });
  }
}
