import { executeQuery } from "../config/db.js";

function getIp(req) {
  const forwarded = req.headers["x-forwarded-for"];

  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || null;
}

function toAuditText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

function toFiniteNumberOrNull(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

export async function registrarBitacora(req, {
  accion,
  tabla,
  registroId = null,
  descripcion = null,
  valorAnterior = null,
  valorNuevo = null
}, execute = executeQuery) {
  try {
    const bitacoraId = await execute("SELECT SEQ_BITACORA.NEXTVAL AS BIT_ID FROM DUAL");
    const bitId = bitacoraId.rows[0].BIT_ID;
    const safeRegistroId = toFiniteNumberOrNull(registroId);
    const safeUsuarioId = toFiniteNumberOrNull(req.usuario?.id);

    await execute(
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
          :bit_id,
          :accion,
          :tabla,
          :registro_id,
          :descripcion,
          :valor_anterior,
          :valor_nuevo,
          :ip_usuario,
          SYSDATE
        )
      `,
      {
        bit_id: bitId,
        accion,
        tabla,
        registro_id: safeRegistroId,
        descripcion,
        valor_anterior: toAuditText(valorAnterior),
        valor_nuevo: toAuditText(valorNuevo),
        ip_usuario: getIp(req)
      }
    );

    if (safeUsuarioId) {
      await execute(
        `
          INSERT INTO EMP_USUARIO_BITACORA (
            USB_ID,
            USU_ID,
            BIT_ID
          ) VALUES (
            EMP_USUARIO_BITACORA_SEQ.NEXTVAL,
            :usu_id,
            :bit_id
          )
        `,
        {
          usu_id: safeUsuarioId,
          bit_id: bitId
        }
      );
    }
  } catch (error) {
    console.error("Error registrando bitacora:", error.message);
  }
}
