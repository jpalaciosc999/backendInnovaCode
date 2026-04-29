import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { executeQuery } from "../../config/db.js";

export async function login(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
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
      WHERE USU_USERNAME = :username
    `;

    const result = await executeQuery(sql, { username });

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

export async function leerToken(req, res) {
  try {
    const { token } = req.body;

    const decodedSinValidar = jwt.decode(token);

    let decodedValidado = null;

    try {
      decodedValidado = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      decodedValidado = "Token inválido o expirado";
    }

    res.json({
      token,
      contenido_sin_validar: decodedSinValidar,
      contenido_validado: decodedValidado
    });

  } catch (error) {
    res.status(500).json({
      message: "Error leyendo token",
      error: error.message
    });
  }
}