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
      INNER JOIN EMP_PERMISOS p 
        ON p.PERMISOS_ID = rp.PER_ID
      WHERE rp.ROL_ID = :rol_id
      ORDER BY p.PER_MODULO, p.PER_NOMBRE_PERMISO
    `,
    { rol_id: rolId }
  );

  return result.rows;
}

export async function login(req, res) {
  try {
    const { username, correo, password } = req.body;
    const login = String(username || correo || "").trim();

    if (!login || !password) {
      return res.status(400).json({
        message: "Usuario y contraseña son obligatorios",
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
        r.ROL_NOMBRE          AS "rol_nombre",
        r.ROL_DESCRIPCION     AS "rol_descripcion",
        r.ROL_NIVEL_ACCESO    AS "rol_nivel_acceso",
        u.EMP_ID              AS "emp_id"
      FROM EMP_USUARIO u
      INNER JOIN EMP_ROLES r
        ON r.ROL_ID = u.ROL_ID
      WHERE LOWER(u.USU_USERNAME) = LOWER(:login)
         OR LOWER(u.USU_CORREO) = LOWER(:login)
    `;

    const result = await executeQuery(sql, { login });

    if (result.rows.length === 0) {
      return res.status(401).json({
        message: "Credenciales incorrectas",
      });
    }

    const usuario = result.rows[0];

    if (usuario.estado !== "A") {
      return res.status(403).json({
        message: "Usuario inactivo",
      });
    }

    let passwordValida = false;

    if (usuario.password && usuario.password.startsWith("$2")) {
      passwordValida = await bcrypt.compare(password, usuario.password);
    } else {
      passwordValida = password === usuario.password;
    }

    if (!passwordValida) {
      return res.status(401).json({
        message: "Credenciales incorrectas",
      });
    }

    const permisos = await getPermisosByRol(usuario.rol_id);

    const usuarioResponse = {
      id: usuario.id,
      username: usuario.username,
      nombre_completo: usuario.nombre_completo,
      correo: usuario.correo,
      estado: usuario.estado,

      rol: usuario.rol_nombre,
      rol_id: usuario.rol_id,
      rol_nombre: usuario.rol_nombre,
      rol_descripcion: usuario.rol_descripcion,
      rol_nivel_acceso: usuario.rol_nivel_acceso,

      ROL_ID: usuario.rol_id,
      ROL_NOMBRE: usuario.rol_nombre,

      emp_id: usuario.emp_id,
      permisos,
    };

    const payload = {
      id: usuarioResponse.id,
      username: usuarioResponse.username,
      nombre_completo: usuarioResponse.nombre_completo,
      correo: usuarioResponse.correo,

      rol: usuarioResponse.rol,
      rol_id: usuarioResponse.rol_id,
      rol_nombre: usuarioResponse.rol_nombre,
      rol_nivel_acceso: usuarioResponse.rol_nivel_acceso,

      ROL_ID: usuarioResponse.ROL_ID,
      ROL_NOMBRE: usuarioResponse.ROL_NOMBRE,

      emp_id: usuarioResponse.emp_id,
      permisos,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "2h",
    });

    return res.json({
      message: "Login correcto",
      token,
      expiresIn: process.env.JWT_EXPIRES_IN || "2h",
      usuario: usuarioResponse,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Error iniciando sesión",
      error: error.message,
    });
  }
}

export async function readToken(req, res) {
  try {
    const { token } = req.body || {};

    if (!token) {
      return res.status(400).json({
        message: "Token requerido",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const fechaExp = new Date(decoded.exp * 1000);
    const fechaIat = new Date(decoded.iat * 1000);

    const tiempoRestanteSeg = decoded.exp - Math.floor(Date.now() / 1000);
    const minutos = Math.floor(tiempoRestanteSeg / 60);
    const segundos = tiempoRestanteSeg % 60;

    return res.json({
      valido: true,

      usuario: {
        id: decoded.id,
        username: decoded.username,
        nombre_completo: decoded.nombre_completo,
        correo: decoded.correo,

        rol: decoded.rol,
        rol_id: decoded.rol_id,
        rol_nombre: decoded.rol_nombre,
        rol_nivel_acceso: decoded.rol_nivel_acceso,

        ROL_ID: decoded.ROL_ID,
        ROL_NOMBRE: decoded.ROL_NOMBRE,

        emp_id: decoded.emp_id,
        permisos: decoded.permisos || [],
      },

      token_info: {
        emitido_en: fechaIat.toLocaleString(),
        expira_en: fechaExp.toLocaleString(),
        tiempo_restante: `${minutos} min ${segundos} seg`,
      },
    });
  } catch (error) {
    return res.status(401).json({
      valido: false,
      message: "Token inválido o expirado",
      error: error.message,
    });
  }
}