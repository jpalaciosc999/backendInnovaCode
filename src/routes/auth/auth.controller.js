import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { executeQuery } from "../../config/db.js";

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
        USU_ID              AS "id",
        USU_USERNAME        AS "username",
        USU_PASSWORD        AS "password",
        USU_NOMBRE_COMPLETO AS "nombre_completo",
        USU_CORREO          AS "correo",
        USU_ESTADO          AS "estado",
        ROL_ID              AS "rol_id",
        EMP_ID              AS "emp_id"
      FROM EMP_USUARIO
      WHERE LOWER(USU_USERNAME) = LOWER(:login)
         OR LOWER(USU_CORREO) = LOWER(:login)
    `;

    const result = await executeQuery(sql, { login });

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Credenciales incorrectas" });
    }

    const usuario = result.rows[0];

    if (usuario.estado !== "A") {
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

    const payload = {
      id: usuario.id,
      username: usuario.username,
      nombre_completo: usuario.nombre_completo,
      correo: usuario.correo,
      rol_id: usuario.rol_id,
      emp_id: usuario.emp_id
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || "2h"
    });

    res.json({
      message: "Login correcto",
      token,
      expiresIn: process.env.JWT_EXPIRES_IN || "2h",
      usuario: {
        id: usuario.id,
        username: usuario.username,
        nombre_completo: usuario.nombre_completo,
        correo: usuario.correo,
        rol_id: usuario.rol_id,
        emp_id: usuario.emp_id
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

    // Validar token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Tiempos
    const fechaExp = new Date(decoded.exp * 1000);
    const fechaIat = new Date(decoded.iat * 1000);
    const ahora = new Date();

    const tiempoRestanteSeg = decoded.exp - Math.floor(Date.now() / 1000);

    const minutos = Math.floor(tiempoRestanteSeg / 60);
    const segundos = tiempoRestanteSeg % 60;

    res.json({
      valido: true,

      usuario: {
        id: decoded.id,
        username: decoded.username,
        nombre_completo: decoded.nombre_completo,
        correo: decoded.correo,
        rol_id: decoded.rol_id,
        emp_id: decoded.emp_id
      },

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
