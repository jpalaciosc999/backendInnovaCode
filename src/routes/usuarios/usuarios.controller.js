import { executeQuery, executeTransaction } from "../../config/db.js";
import bcrypt from "bcryptjs";
import { registrarBitacora } from "../../utils/auditoria.js";
import { canManageRoleLevel, isCurrentUser } from "../../utils/adminAccess.js";

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : value;
}

function normalizeEstado(value) {
  const estado = typeof value === "string" ? value.trim().toUpperCase() : value;
  return estado || "A";
}

function toNumberOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();

    if (!trimmedValue || trimmedValue.toLowerCase() === "null" || trimmedValue.toLowerCase() === "undefined") {
      return null;
    }

    const numberValue = Number(trimmedValue);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function sanitizeUsuarioAudit(payload) {
  const { password, usu_password, passwordRequired, ...safePayload } = payload;

  return safePayload;
}

function getParamId(value) {
  const id = toNumberOrNull(value);
  return Number.isFinite(id) ? id : null;
}

function handleUsuarioDbError(res, error, defaultMessage) {
  const message = String(error?.message || "");

  if (message.includes("FK_USUARIO_EMPLEADO") || message.includes("ORA-02291")) {
    return res.status(400).json({
      message: "El empleado seleccionado no existe. Selecciona un empleado valido antes de guardar el usuario."
    });
  }

  return res.status(error.status || 500).json({
    message: defaultMessage,
    error: error.message
  });
}

async function existeRol(rolId) {
  return Boolean(await getRolActivo(rolId));
}

async function getRolActivo(rolId) {
  if (!rolId) {
    return null;
  }

  const result = await executeQuery(
    `
      SELECT
        ROL_ID,
        ROL_NOMBRE,
        ROL_NIVEL_ACCESO
      FROM EMP_ROLES
      WHERE ROL_ID = :rol_id
        AND NVL(ROL_ESTADO, 'A') = 'A'
    `,
    { rol_id: rolId }
  );

  return result.rows[0] || null;
}

async function existeEmpleado(empId) {
  if (!empId) {
    return true;
  }

  const result = await executeQuery(
    `
      SELECT 1
      FROM EMP_EMPLEADO
      WHERE EMP_ID = :emp_id
    `,
    { emp_id: empId }
  );

  return result.rows.length > 0;
}

async function existeUsuarioOCorreo(username, correo, userId = null) {
  const result = await executeQuery(
    `
      SELECT 1
      FROM EMP_USUARIO
      WHERE (:user_id IS NULL OR USU_ID <> :user_id)
        AND (
          LOWER(USU_USERNAME) = LOWER(:username)
          OR LOWER(USU_CORREO) = LOWER(:correo)
        )
    `,
    { username, correo, user_id: userId }
  );

  return result.rows.length > 0;
}

async function validarUsuario(payload, userId = null) {
  if (!payload.username || !payload.passwordRequired || !payload.nombreCompleto || !payload.correo) {
    return "Campos obligatorios faltantes";
  }

  if (!["A", "I"].includes(payload.estado)) {
    return "El estado del usuario debe ser A o I";
  }

  if (!Number.isFinite(payload.rolId)) {
    return "El rol es obligatorio";
  }

  if (!(await existeRol(payload.rolId))) {
    return "El rol indicado no existe o esta inactivo";
  }

  if (!(await existeEmpleado(payload.empId))) {
    return "El empleado indicado no existe";
  }

  if (await existeUsuarioOCorreo(payload.username, payload.correo, userId)) {
    return "El username o correo ya esta registrado";
  }

  return null;
}

async function getUsuarioSnapshot(usuarioId) {
  const result = await executeQuery(
    `
      SELECT
        u.USU_ID,
        u.USU_USERNAME,
        u.USU_NOMBRE_COMPLETO,
        u.USU_CORREO,
        u.USU_ESTADO,
        u.ROL_ID,
        r.ROL_NOMBRE,
        r.ROL_NIVEL_ACCESO,
        u.EMP_ID
      FROM EMP_USUARIO u
      LEFT JOIN EMP_ROLES r ON r.ROL_ID = u.ROL_ID
      WHERE u.USU_ID = :id
    `,
    { id: usuarioId }
  );

  return result.rows[0] || null;
}

/* =======================
   OBTENER USUARIOS
======================= */
export async function getUsuarios(req, res) {
  try {
    const sql = `
      SELECT
        u.USU_ID,
        u.USU_ID AS "id",
        u.USU_USERNAME,
        u.USU_USERNAME AS "username",
        u.USU_NOMBRE_COMPLETO,
        u.USU_NOMBRE_COMPLETO AS "nombre_completo",
        u.USU_CORREO,
        u.USU_CORREO AS "correo",
        u.USU_ESTADO,
        u.USU_ESTADO AS "estado",
        u.USU_FECHA_CREACION,
        u.USU_FECHA_CREACION AS "fecha_creacion",
        u.ROL_ID,
        u.ROL_ID AS "rol_id",
        r.ROL_NOMBRE,
        r.ROL_NOMBRE AS "rol_nombre",
        r.ROL_NIVEL_ACCESO,
        r.ROL_NIVEL_ACCESO AS "rol_nivel_acceso",
        u.EMP_ID,
        u.EMP_ID AS "emp_id",
        e.EMP_NOMBRE || ' ' || e.EMP_APELLIDO AS EMPLEADO_NOMBRE,
        e.EMP_NOMBRE || ' ' || e.EMP_APELLIDO AS "empleado_nombre",
        e.EMP_DPI,
        e.EMP_DPI AS "emp_dpi",
        e.EMP_ESTADO,
        e.EMP_ESTADO AS "emp_estado"
      FROM EMP_USUARIO u
      LEFT JOIN EMP_ROLES r ON r.ROL_ID = u.ROL_ID
      LEFT JOIN EMP_EMPLEADO e ON e.EMP_ID = u.EMP_ID
      ORDER BY u.USU_ESTADO, r.ROL_NIVEL_ACCESO, u.USU_NOMBRE_COMPLETO
    `;
    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo usuarios", error: error.message });
  }
}

/* =======================
   OBTENER USUARIO POR ID
======================= */
export async function getUsuarioById(req, res) {
  try {
    const { id } = req.params;
    const usuarioId = getParamId(id);

    if (!usuarioId) {
      return res.status(400).json({ message: "El id del usuario debe ser numerico" });
    }

    const sql = `
      SELECT
        u.USU_ID,
        u.USU_ID AS "id",
        u.USU_USERNAME,
        u.USU_USERNAME AS "username",
        u.USU_NOMBRE_COMPLETO,
        u.USU_NOMBRE_COMPLETO AS "nombre_completo",
        u.USU_CORREO,
        u.USU_CORREO AS "correo",
        u.USU_ESTADO,
        u.USU_ESTADO AS "estado",
        u.USU_FECHA_CREACION,
        u.USU_FECHA_CREACION AS "fecha_creacion",
        u.ROL_ID,
        u.ROL_ID AS "rol_id",
        r.ROL_NOMBRE,
        r.ROL_NOMBRE AS "rol_nombre",
        r.ROL_NIVEL_ACCESO,
        r.ROL_NIVEL_ACCESO AS "rol_nivel_acceso",
        u.EMP_ID,
        u.EMP_ID AS "emp_id",
        e.EMP_NOMBRE || ' ' || e.EMP_APELLIDO AS EMPLEADO_NOMBRE,
        e.EMP_NOMBRE || ' ' || e.EMP_APELLIDO AS "empleado_nombre",
        e.EMP_DPI,
        e.EMP_DPI AS "emp_dpi",
        e.EMP_ESTADO,
        e.EMP_ESTADO AS "emp_estado"
      FROM EMP_USUARIO u
      LEFT JOIN EMP_ROLES r ON r.ROL_ID = u.ROL_ID
      LEFT JOIN EMP_EMPLEADO e ON e.EMP_ID = u.EMP_ID
      WHERE u.USU_ID = :id
    `;
    const result = await executeQuery(sql, { id: usuarioId });
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo usuario", error: error.message });
  }
}

/* =======================
   CREAR USUARIO
======================= */
export async function createUsuario(req, res) {
  try {
    const {
      username,
      usu_username,
      password,
      usu_password,
      nombre_completo,
      usu_nombre_completo,
      correo,
      usu_correo,
      estado,
      usu_estado,
      rol_id,
      rolId,
      emp_id,
      empId
    } = req.body;
    const usuarioUsername = normalizeString(username || usu_username);
    const usuarioPassword = password || usu_password;
    const usuarioNombre = normalizeString(nombre_completo || usu_nombre_completo);
    const usuarioCorreo = normalizeString(correo || usu_correo);
    const payload = {
      username: usuarioUsername,
      passwordRequired: usuarioPassword,
      nombreCompleto: usuarioNombre,
      correo: usuarioCorreo,
      estado: normalizeEstado(estado || usu_estado),
      rolId: toNumberOrNull(rol_id ?? rolId),
      empId: toNumberOrNull(emp_id ?? empId)
    };

    const validationError = await validarUsuario(payload);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const rolAsignado = await getRolActivo(payload.rolId);

    if (!canManageRoleLevel(req, rolAsignado?.ROL_NIVEL_ACCESO)) {
      return res.status(403).json({
        message: "No puede asignar un rol de nivel igual o superior al suyo"
      });
    }

    const passwordHash = await bcrypt.hash(usuarioPassword, 10);

    const sql = `
      INSERT INTO EMP_USUARIO (
        USU_ID, USU_USERNAME, USU_PASSWORD,
        USU_NOMBRE_COMPLETO, USU_CORREO,
        USU_ESTADO, USU_FECHA_CREACION,
        ROL_ID, EMP_ID
      ) VALUES (
        SEQ_EMP_USUARIO.NEXTVAL,
        :username, :password,
        :nombre_completo, :correo,
        :estado, SYSDATE,
        :rol_id, :emp_id
      )
    `;

    await executeTransaction(async ({ execute }) => {
      await execute(sql, {
        username: usuarioUsername,
        password: passwordHash,
        nombre_completo: usuarioNombre,
        correo: usuarioCorreo,
        estado: payload.estado,
        rol_id: payload.rolId,
        emp_id: payload.empId,
      });

      await registrarBitacora(req, {
        accion: "CREATE",
        tabla: "EMP_USUARIO",
        descripcion: `Usuario creado: ${usuarioUsername}`,
        valorNuevo: sanitizeUsuarioAudit(payload)
      }, execute);
    });

    res.status(201).json({ message: "Usuario creado correctamente" });
  } catch (error) {
    handleUsuarioDbError(res, error, "Error creando usuario");
  }
}

/* =======================
   ACTUALIZAR USUARIO
======================= */
export async function updateUsuario(req, res) {
  try {
    const { id } = req.params;
    const usuarioId = getParamId(id);

    if (!usuarioId) {
      return res.status(400).json({ message: "El id del usuario debe ser numerico" });
    }

    const usuarioAnterior = await getUsuarioSnapshot(usuarioId);

    if (!usuarioAnterior) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const {
      username,
      usu_username,
      password,
      usu_password,
      nombre_completo,
      usu_nombre_completo,
      correo,
      usu_correo,
      estado,
      usu_estado,
      rol_id,
      rolId,
      emp_id,
      empId
    } = req.body;
    const usuarioUsername = normalizeString(username || usu_username);
    const usuarioPassword = password || usu_password;
    const usuarioNombre = normalizeString(nombre_completo || usu_nombre_completo);
    const usuarioCorreo = normalizeString(correo || usu_correo);
    const payload = {
      username: usuarioUsername,
      passwordRequired: true,
      nombreCompleto: usuarioNombre,
      correo: usuarioCorreo,
      estado: normalizeEstado(estado || usu_estado),
      rolId: toNumberOrNull(rol_id ?? rolId),
      empId: toNumberOrNull(emp_id ?? empId)
    };

    const validationError = await validarUsuario(payload, usuarioId);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const rolAsignado = await getRolActivo(payload.rolId);

    if (!canManageRoleLevel(req, usuarioAnterior.ROL_NIVEL_ACCESO) ||
        !canManageRoleLevel(req, rolAsignado?.ROL_NIVEL_ACCESO)) {
      return res.status(403).json({
        message: "No puede administrar usuarios con rol de nivel igual o superior al suyo"
      });
    }

    if (isCurrentUser(req, usuarioId) &&
        (payload.rolId !== usuarioAnterior.ROL_ID || payload.estado !== usuarioAnterior.USU_ESTADO)) {
      return res.status(403).json({
        message: "No puede cambiar su propio rol o estado"
      });
    }

    const passwordSql = usuarioPassword ? "USU_PASSWORD = :password," : "";
    const binds = {
      id: usuarioId,
      username: usuarioUsername,
      nombre_completo: usuarioNombre,
      correo: usuarioCorreo,
      estado: payload.estado,
      rol_id: payload.rolId,
      emp_id: payload.empId
    };

    if (usuarioPassword) {
      binds.password = await bcrypt.hash(usuarioPassword, 10);
    }

    const sql = `
      UPDATE EMP_USUARIO SET
        USU_USERNAME        = :username,
        ${passwordSql}
        USU_NOMBRE_COMPLETO = :nombre_completo,
        USU_CORREO          = :correo,
        USU_ESTADO          = :estado,
        ROL_ID              = :rol_id,
        EMP_ID              = :emp_id
      WHERE USU_ID = :id
    `;

    await executeTransaction(async ({ execute }) => {
      const result = await execute(sql, binds);

      if (result.rowsAffected === 0) {
        const error = new Error("Usuario no encontrado");
        error.status = 404;
        throw error;
      }

      await registrarBitacora(req, {
        accion: "UPDATE",
        tabla: "EMP_USUARIO",
        registroId: usuarioId,
        descripcion: `Usuario actualizado: ${usuarioUsername}`,
        valorAnterior: sanitizeUsuarioAudit(usuarioAnterior),
        valorNuevo: sanitizeUsuarioAudit(payload)
      }, execute);
    });

    res.json({ message: "Usuario actualizado correctamente" });
  } catch (error) {
    handleUsuarioDbError(res, error, "Error actualizando usuario");
  }
}

/* =======================
   ELIMINAR USUARIO
======================= */
export async function deleteUsuario(req, res) {
  try {
    const { id } = req.params;
    const usuarioId = getParamId(id);

    if (!usuarioId) {
      return res.status(400).json({ message: "El id del usuario debe ser numerico" });
    }

    const usuarioAnterior = await getUsuarioSnapshot(usuarioId);

    if (!usuarioAnterior) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    if (isCurrentUser(req, usuarioId)) {
      return res.status(403).json({
        message: "No puede inactivar su propio usuario"
      });
    }

    if (!canManageRoleLevel(req, usuarioAnterior.ROL_NIVEL_ACCESO)) {
      return res.status(403).json({
        message: "No puede inactivar usuarios con rol de nivel igual o superior al suyo"
      });
    }

    const sql = `
      UPDATE EMP_USUARIO
      SET USU_ESTADO = 'I'
      WHERE USU_ID = :id
    `;
    await executeTransaction(async ({ execute }) => {
      const result = await execute(sql, { id: usuarioId });

      if (result.rowsAffected === 0) {
        const error = new Error("Usuario no encontrado");
        error.status = 404;
        throw error;
      }

      await registrarBitacora(req, {
        accion: "INACTIVATE",
        tabla: "EMP_USUARIO",
        registroId: usuarioId,
        descripcion: "Usuario inactivado",
        valorAnterior: sanitizeUsuarioAudit(usuarioAnterior),
        valorNuevo: { usu_estado: "I" }
      }, execute);
    });

    res.json({ message: "Usuario inactivado correctamente" });
  } catch (error) {
    handleUsuarioDbError(res, error, "Error eliminando usuario");
  }
}

/* =======================
   ELIMINAR USUARIO DEFINITIVO
======================= */
export async function deleteUsuarioPermanente(req, res) {
  try {
    const { id } = req.params;
    const usuarioId = getParamId(id);

    if (!usuarioId) {
      return res.status(400).json({ message: "El id del usuario debe ser numerico" });
    }

    const usuarioAnterior = await getUsuarioSnapshot(usuarioId);

    if (!usuarioAnterior) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    if (isCurrentUser(req, usuarioId)) {
      return res.status(403).json({
        message: "No puede eliminar el usuario con el que tiene la sesion abierta"
      });
    }

    if (!canManageRoleLevel(req, usuarioAnterior.ROL_NIVEL_ACCESO)) {
      return res.status(403).json({
        message: "No puede eliminar usuarios con rol de nivel igual o superior al suyo"
      });
    }

    await executeTransaction(async ({ execute }) => {
      await execute(
        `
          DELETE FROM EMP_USUARIO_BITACORA
          WHERE USU_ID = :id
        `,
        { id: usuarioId }
      );

      const result = await execute(
        `
          DELETE FROM EMP_USUARIO
          WHERE USU_ID = :id
        `,
        { id: usuarioId }
      );

      if (result.rowsAffected === 0) {
        const error = new Error("Usuario no encontrado");
        error.status = 404;
        throw error;
      }

      await registrarBitacora(req, {
        accion: "DELETE",
        tabla: "EMP_USUARIO",
        registroId: usuarioId,
        descripcion: "Usuario eliminado definitivamente",
        valorAnterior: sanitizeUsuarioAudit(usuarioAnterior)
      }, execute);
    });

    res.json({ message: "Usuario eliminado definitivamente" });
  } catch (error) {
    handleUsuarioDbError(res, error, "Error eliminando usuario definitivamente");
  }
}
