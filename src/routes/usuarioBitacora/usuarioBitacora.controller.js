import { executeQuery } from "../../config/db.js";

function toNumberOrNull(value) {
  return value === undefined || value === null || value === "" ? null : Number(value);
}

function getParamId(value) {
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
}

function normalizeInteger(value, defaultValue, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue < min || numberValue > max) {
    return null;
  }

  return numberValue;
}

function getSelectSql(where = "") {
  return `
    SELECT
      ub.USB_ID,
      ub.USU_ID,
      u.USU_USERNAME,
      u.USU_NOMBRE_COMPLETO,
      ub.BIT_ID,
      b.BIT_ACCION,
      b.BIT_TABLA_AFECTADA,
      b.BIT_FECHA
    FROM EMP_USUARIO_BITACORA ub
    INNER JOIN EMP_USUARIO u ON u.USU_ID = ub.USU_ID
    INNER JOIN EMP_BITACORA b ON b.BIT_ID = ub.BIT_ID
    ${where}
  `;
}

async function existeUsuario(usuId) {
  const result = await executeQuery(
    `
      SELECT 1
      FROM EMP_USUARIO
      WHERE USU_ID = :usu_id
    `,
    { usu_id: usuId }
  );

  return result.rows.length > 0;
}

async function existeBitacora(bitId) {
  const result = await executeQuery(
    `
      SELECT 1
      FROM EMP_BITACORA
      WHERE BIT_ID = :bit_id
    `,
    { bit_id: bitId }
  );

  return result.rows.length > 0;
}

async function existeRelacion(usuId, bitId, usbId = null) {
  const result = await executeQuery(
    `
      SELECT 1
      FROM EMP_USUARIO_BITACORA
      WHERE USU_ID = :usu_id
        AND BIT_ID = :bit_id
        AND (:usb_id IS NULL OR USB_ID <> :usb_id)
    `,
    { usu_id: usuId, bit_id: bitId, usb_id: usbId }
  );

  return result.rows.length > 0;
}

async function validarPayload(payload, usbId = null) {
  if (!Number.isFinite(payload.usu_id)) {
    return "El usuario es obligatorio";
  }

  if (!Number.isFinite(payload.bit_id)) {
    return "La bitacora es obligatoria";
  }

  if (!(await existeUsuario(payload.usu_id))) {
    return "El usuario indicado no existe";
  }

  if (!(await existeBitacora(payload.bit_id))) {
    return "La bitacora indicada no existe";
  }

  if (await existeRelacion(payload.usu_id, payload.bit_id, usbId)) {
    return "La relacion usuario-bitacora ya existe";
  }

  return null;
}

export async function getUsuarioBitacoras(req, res) {
  try {
    const limit = normalizeInteger(req.query.limit, 100, { min: 1, max: 200 });
    const offset = normalizeInteger(req.query.offset, 0, { min: 0, max: 100000 });

    if (limit === null || offset === null) {
      return res.status(400).json({
        message: "Los parametros limit y offset deben ser numericos y validos"
      });
    }

    const result = await executeQuery(
      `
        ${getSelectSql()}
        ORDER BY b.BIT_FECHA DESC, ub.USB_ID DESC
        OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
      `,
      { limit, offset }
    );

    res.json({
      data: result.rows,
      pagination: {
        limit,
        offset,
        count: result.rows.length
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo usuario_bitacora", error: error.message });
  }
}

export async function getUsuarioBitacoraById(req, res) {
  try {
    const { id } = req.params;
    const usbId = getParamId(id);

    if (!usbId) {
      return res.status(400).json({ message: "El id del registro debe ser numerico" });
    }

    const result = await executeQuery(getSelectSql("WHERE ub.USB_ID = :id"), {
      id: usbId
    });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Registro no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ message: "Error obteniendo registro", error: error.message });
  }
}

export async function createUsuarioBitacora(req, res) {
  try {
    const payload = {
      usu_id: toNumberOrNull(req.body.usu_id),
      bit_id: toNumberOrNull(req.body.bit_id)
    };
    const validationError = await validarPayload(payload);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    await executeQuery(
      `
        INSERT INTO EMP_USUARIO_BITACORA (
          USB_ID, USU_ID, BIT_ID
        )
        VALUES (
          EMP_USUARIO_BITACORA_SEQ.NEXTVAL, :usu_id, :bit_id
        )
      `,
      payload
    );

    res.status(201).json({ message: "Registro creado correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error creando registro", error: error.message });
  }
}

export async function updateUsuarioBitacora(req, res) {
  try {
    const { id } = req.params;
    const payload = {
      id: Number(id),
      usu_id: toNumberOrNull(req.body.usu_id),
      bit_id: toNumberOrNull(req.body.bit_id)
    };
    const validationError = await validarPayload(payload, Number(id));

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const result = await executeQuery(
      `
        UPDATE EMP_USUARIO_BITACORA
        SET
          USU_ID = :usu_id,
          BIT_ID = :bit_id
        WHERE USB_ID = :id
      `,
      payload
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Registro no encontrado" });
    }

    res.json({ message: "Registro actualizado correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error actualizando registro", error: error.message });
  }
}

export async function deleteUsuarioBitacora(req, res) {
  try {
    const { id } = req.params;
    const result = await executeQuery(
      `
        DELETE FROM EMP_USUARIO_BITACORA
        WHERE USB_ID = :id
      `,
      { id: Number(id) }
    );

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Registro no encontrado" });
    }

    res.json({ message: "Registro eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ message: "Error eliminando registro", error: error.message });
  }
}
