import { executeQuery } from "../../config/db.js";

function getSelectSql(where = "") {
  return `
    SELECT
      BIT_ID,
      BIT_ACCION,
      BIT_TABLA_AFECTADA,
      BIT_ID_REGISTRO,
      DBMS_LOB.SUBSTR(BIT_DESCRIPCION, 4000, 1) AS BIT_DESCRIPCION,
      DBMS_LOB.SUBSTR(BIT_VALOR_ANTERIOR, 4000, 1) AS BIT_VALOR_ANTERIOR,
      DBMS_LOB.SUBSTR(BIT_VALOR_NUEVO, 4000, 1) AS BIT_VALOR_NUEVO,
      BIT_IP_USUARIO,
      BIT_FECHA
    FROM EMP_BITACORA
    ${where}
  `;
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

export const getBitacora = async (req, res) => {
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
        ORDER BY BIT_FECHA DESC, BIT_ID DESC
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
    res.status(500).json({
      message: "Error obteniendo bitacora",
      error: error.message
    });
  }
};

export const getBitacoraById = async (req, res) => {
  try {
    const { id } = req.params;
    const bitacoraId = getParamId(id);

    if (!bitacoraId) {
      return res.status(400).json({ message: "El id de la bitacora debe ser numerico" });
    }

    const result = await executeQuery(getSelectSql("WHERE BIT_ID = :id"), {
      id: bitacoraId
    });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Bitacora no encontrada" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo bitacora",
      error: error.message
    });
  }
};

export const createBitacora = async (req, res) => {
  try {
    const {
      bit_accion,
      bit_tabla_afectada,
      bit_id_registro,
      bit_descripcion,
      bit_valor_anterior,
      bit_valor_nuevo,
      bit_ip_usuario
    } = req.body;

    if (!bit_accion || !bit_tabla_afectada) {
      return res.status(400).json({
        message: "La accion y tabla afectada son obligatorias"
      });
    }

    await executeQuery(
      `
        INSERT INTO EMP_BITACORA (
          BIT_ID,
          BIT_ACCION,
          BIT_TABLA_AFECTADA,
          BIT_ID_REGISTRO,
          BIT_DESCRIPCION,
          BIT_VALOR_ANTERIOR,
          BIT_VALOR_NUEVO,
          BIT_IP_USUARIO,
          BIT_FECHA
        ) VALUES (
          SEQ_BITACORA.NEXTVAL,
          :bit_accion,
          :bit_tabla_afectada,
          :bit_id_registro,
          :bit_descripcion,
          :bit_valor_anterior,
          :bit_valor_nuevo,
          :bit_ip_usuario,
          SYSDATE
        )
      `,
      {
        bit_accion,
        bit_tabla_afectada,
        bit_id_registro: bit_id_registro || null,
        bit_descripcion: bit_descripcion || null,
        bit_valor_anterior: bit_valor_anterior || null,
        bit_valor_nuevo: bit_valor_nuevo || null,
        bit_ip_usuario: bit_ip_usuario || req.ip || req.headers["x-forwarded-for"] || null
      }
    );

    res.status(201).json({ message: "Bitacora creada correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error creando bitacora",
      error: error.message
    });
  }
};

export const updateBitacora = async (req, res) => {
  res.status(405).json({
    message: "La bitacora es de solo lectura y no se puede modificar"
  });
};

export const deleteBitacora = async (req, res) => {
  res.status(405).json({
    message: "La bitacora es historica y no se puede eliminar"
  });
};
