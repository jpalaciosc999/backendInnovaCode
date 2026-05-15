import { executeQuery, executeTransaction } from "../../config/db.js";

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function normalizeDate(value) {
  return value === "" || value === undefined ? null : value;
}

function normalizeOptionalText(value) {
  return typeof value === "string" ? value.trim() || null : value ?? null;
}

function isDateValue(value) {
  return value === null || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toNumberOrNull(value) {
  return value === undefined || value === null || value === "" ? null : Number(value);
}

function subtractOneDay(dateValue) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function hasContractPayload(body) {
  return (
    Object.prototype.hasOwnProperty.call(body, "emp_fecha_inicio_contrato") ||
    Object.prototype.hasOwnProperty.call(body, "emp_fecha_fin_contrato") ||
    Object.prototype.hasOwnProperty.call(body, "emp_motivo_cambio_contrato")
  );
}

const EMPLOYEE_DIRECT_DELETE_DEPENDENCIES = [
  { table: "EMP_MARCAJE", label: "marcajes" },
  { table: "EMP_LIQUIDACIONES", label: "liquidaciones" },
  { table: "EMP_CUENTA_BANCARIA", label: "cuentas bancarias" },
  { table: "EMP_CONTROL_LABORAL", label: "control laboral" },
  { table: "EMP_SUSPENSION_IGSS", label: "suspensiones IGSS" },
  { table: "EMP_KPI_RESULTADO", label: "resultados KPI" }
];

async function tableHasColumn(execute, tableName, columnName) {
  const result = await execute(
    `
      SELECT COUNT(*) AS TOTAL
      FROM USER_TAB_COLUMNS
      WHERE TABLE_NAME = :table_name
        AND COLUMN_NAME = :column_name
    `,
    {
      table_name: tableName.toUpperCase(),
      column_name: columnName.toUpperCase()
    }
  );

  return Number(result.rows[0]?.TOTAL || 0) > 0;
}

async function deleteIfColumnExists(execute, tableName, columnName, value, summary, label) {
  const hasColumn = await tableHasColumn(execute, tableName, columnName);

  if (!hasColumn) {
    return;
  }

  const result = await execute(
    `DELETE FROM ${tableName} WHERE ${columnName} = :value`,
    { value }
  );

  const rowsAffected = Number(result.rowsAffected || 0);

  if (rowsAffected > 0) {
    summary.push(`${label}: ${rowsAffected}`);
  }
}

async function updateEmployeeReferenceToNull(execute, empId, columnName) {
  const hasColumn = await tableHasColumn(execute, "EMP_EMPLEADO", columnName);

  if (!hasColumn) {
    return;
  }

  await execute(
    `UPDATE EMP_EMPLEADO SET ${columnName} = NULL WHERE EMP_ID = :id`,
    { id: empId }
  );
}

async function deletePayrollForEmployee(execute, empId, summary) {
  const hasNominaEmpId = await tableHasColumn(execute, "EMP_NOMINA", "EMP_ID");
  const hasDetalleNomId = await tableHasColumn(execute, "EMP_NOMINA_DETALLE", "NOM_ID");

  if (!hasNominaEmpId) {
    return;
  }

  if (hasDetalleNomId) {
    const hasDescuentoDetId = await tableHasColumn(execute, "EMP_NOMINA_DESCUENTO", "DET_ID");

    if (hasDescuentoDetId) {
      const descuentoResult = await execute(
        `
          DELETE FROM EMP_NOMINA_DESCUENTO
          WHERE DET_ID IN (
            SELECT d.DET_ID
            FROM EMP_NOMINA_DETALLE d
            INNER JOIN EMP_NOMINA n ON n.NOM_ID = d.NOM_ID
            WHERE n.EMP_ID = :id
          )
        `,
        { id: empId }
      );

      if (Number(descuentoResult.rowsAffected || 0) > 0) {
        summary.push(`descuentos de nomina: ${descuentoResult.rowsAffected}`);
      }
    }

    const detalleResult = await execute(
      `
        DELETE FROM EMP_NOMINA_DETALLE
        WHERE NOM_ID IN (
          SELECT NOM_ID
          FROM EMP_NOMINA
          WHERE EMP_ID = :id
        )
      `,
      { id: empId }
    );

    if (Number(detalleResult.rowsAffected || 0) > 0) {
      summary.push(`detalles de nomina: ${detalleResult.rowsAffected}`);
    }
  }

  const nominaResult = await execute(
    `
      DELETE FROM EMP_NOMINA
      WHERE EMP_ID = :id
    `,
    { id: empId }
  );

  if (Number(nominaResult.rowsAffected || 0) > 0) {
    summary.push(`nominas: ${nominaResult.rowsAffected}`);
  }
}

async function deleteLoansForEmployee(execute, empId, summary) {
  const hasPrestamoEmpId = await tableHasColumn(execute, "EMP_PRESTAMO", "EMP_ID");
  const hasPrestamoDetallePreId = await tableHasColumn(execute, "EMP_PRESTAMO_DETALLE", "PRE_ID");

  if (!hasPrestamoEmpId) {
    return;
  }

  if (hasPrestamoDetallePreId) {
    const detalleResult = await execute(
      `
        DELETE FROM EMP_PRESTAMO_DETALLE
        WHERE PRE_ID IN (
          SELECT PRE_ID
          FROM EMP_PRESTAMO
          WHERE EMP_ID = :id
        )
      `,
      { id: empId }
    );

    if (Number(detalleResult.rowsAffected || 0) > 0) {
      summary.push(`detalles de prestamo: ${detalleResult.rowsAffected}`);
    }
  }

  const prestamoResult = await execute(
    `
      DELETE FROM EMP_PRESTAMO
      WHERE EMP_ID = :id
    `,
    { id: empId }
  );

  if (Number(prestamoResult.rowsAffected || 0) > 0) {
    summary.push(`prestamos: ${prestamoResult.rowsAffected}`);
  }
}

async function deleteUsersForEmployee(execute, empId, summary) {
  const hasUsuarioEmpId = await tableHasColumn(execute, "EMP_USUARIO", "EMP_ID");

  if (!hasUsuarioEmpId) {
    return;
  }

  const hasUsuarioBitacoraUsuId = await tableHasColumn(execute, "EMP_USUARIO_BITACORA", "USU_ID");

  if (hasUsuarioBitacoraUsuId) {
    const usuarioBitacoraResult = await execute(
      `
        DELETE FROM EMP_USUARIO_BITACORA
        WHERE USU_ID IN (
          SELECT USU_ID
          FROM EMP_USUARIO
          WHERE EMP_ID = :id
        )
      `,
      { id: empId }
    );

    if (Number(usuarioBitacoraResult.rowsAffected || 0) > 0) {
      summary.push(`relaciones usuario-bitacora: ${usuarioBitacoraResult.rowsAffected}`);
    }
  }

  const usuarioResult = await execute(
    `
      DELETE FROM EMP_USUARIO
      WHERE EMP_ID = :id
    `,
    { id: empId }
  );

  if (Number(usuarioResult.rowsAffected || 0) > 0) {
    summary.push(`usuarios: ${usuarioResult.rowsAffected}`);
  }
}

function normalizeContractPayload(body, tipoContrato) {
  const nombreContrato = String(tipoContrato?.TIC_NOMBRE || "").trim().toUpperCase();
  const descripcionContrato = String(tipoContrato?.TIC_DESCRIPCION || "").trim().toUpperCase();
  const isIndefinido = nombreContrato.includes("INDEFINIDO") ||
    descripcionContrato.includes("INDEFINIDO");
  const payload = {
    tic_id: toNumberOrNull(body.tic_id),
    fecha_inicio: normalizeDate(body.emp_fecha_inicio_contrato),
    fecha_fin: isIndefinido ? null : normalizeDate(body.emp_fecha_fin_contrato),
    motivo: normalizeOptionalText(body.emp_motivo_cambio_contrato),
    is_indefinido: isIndefinido
  };

  if (!payload.fecha_inicio) {
    throw new HttpError(400, "La fecha de inicio del nuevo contrato es obligatoria");
  }

  if (!isDateValue(payload.fecha_inicio)) {
    throw new HttpError(400, "La fecha de inicio del contrato debe tener formato YYYY-MM-DD");
  }

  if (!isDateValue(payload.fecha_fin)) {
    throw new HttpError(400, "La fecha de fin del contrato debe tener formato YYYY-MM-DD o enviarse vacia");
  }

  if (!payload.tic_id) {
    throw new HttpError(400, "El tipo de contrato es obligatorio para cambiar contrato");
  }

  if (!payload.is_indefinido && !payload.fecha_fin) {
    throw new HttpError(400, "La fecha de fin es obligatoria para contratos no indefinidos");
  }

  if (payload.fecha_fin && payload.fecha_fin < payload.fecha_inicio) {
    throw new HttpError(400, "La fecha de fin del contrato no puede ser anterior a la fecha de inicio");
  }

  return payload;
}

function shouldCreateNewContract(currentContract, payload) {
  if (!currentContract) {
    return true;
  }

  return (
    Number(currentContract.TIC_ID) !== Number(payload.tic_id) ||
    currentContract.TCO_FECHA_INICIO !== payload.fecha_inicio ||
    (currentContract.TCO_FECHA_FIN ?? null) !== (payload.fecha_fin ?? null)
  );
}

async function ensureTipoContratoExists(execute, ticId) {
  const result = await execute(
    `
      SELECT TIC_ID, TIC_NOMBRE, TIC_DESCRIPCION
      FROM EMP_TIPO_CONTRATO
      WHERE TIC_ID = :tic_id
    `,
    { tic_id: ticId }
  );

  if (result.rows.length === 0) {
    throw new HttpError(400, "El tipo de contrato indicado no existe");
  }

  return result.rows[0];
}

async function getCurrentContractForUpdate(execute, empId) {
  const result = await execute(
    `
      SELECT
        TCO_ID,
        TO_CHAR(TCO_FECHA_INICIO, 'YYYY-MM-DD') AS TCO_FECHA_INICIO,
        TO_CHAR(TCO_FECHA_FIN, 'YYYY-MM-DD') AS TCO_FECHA_FIN,
        TIC_ID
      FROM EMP_EMPLEADO_CONTRATO
      WHERE EMP_ID = :emp_id
        AND TCO_ES_ACTUAL = 1
      FOR UPDATE
    `,
    { emp_id: empId }
  );

  if (result.rows.length > 1) {
    throw new HttpError(409, "El empleado tiene mas de un contrato actual");
  }

  return result.rows[0] || null;
}

async function ensureNoOverlappingContract(execute, empId, payload, currentContractId) {
  const result = await execute(
    `
      SELECT TCO_ID
      FROM EMP_EMPLEADO_CONTRATO
      WHERE EMP_ID = :emp_id
        AND TCO_ID <> NVL(:current_tco_id, -1)
        AND NVL(TCO_ESTADO, 'A') <> 'I'
        AND TCO_FECHA_INICIO <= NVL(TO_DATE(:fecha_fin, 'YYYY-MM-DD'), DATE '9999-12-31')
        AND NVL(TCO_FECHA_FIN, DATE '9999-12-31') >= TO_DATE(:fecha_inicio, 'YYYY-MM-DD')
    `,
    {
      emp_id: empId,
      current_tco_id: currentContractId,
      fecha_inicio: payload.fecha_inicio,
      fecha_fin: payload.fecha_fin
    }
  );

  if (result.rows.length > 0) {
    throw new HttpError(409, "El nuevo contrato se solapa con otro contrato del empleado");
  }
}

async function applyContractChange(execute, empId, payload) {
  const currentContract = await getCurrentContractForUpdate(execute, empId);

  if (!shouldCreateNewContract(currentContract, payload)) {
    return;
  }

  if (currentContract && !payload.motivo) {
    throw new HttpError(400, "El motivo del cambio de contrato es obligatorio");
  }

  const contractReason = payload.motivo || "Contrato inicial";

  if (currentContract && payload.fecha_inicio <= currentContract.TCO_FECHA_INICIO) {
    throw new HttpError(
      400,
      "La fecha de inicio del nuevo contrato debe ser posterior al contrato actual"
    );
  }

  await ensureNoOverlappingContract(
    execute,
    empId,
    payload,
    currentContract ? currentContract.TCO_ID : null
  );

  if (currentContract) {
    await execute(
      `
        UPDATE EMP_EMPLEADO_CONTRATO
        SET
          TCO_FECHA_FIN = TO_DATE(:fecha_fin_actual, 'YYYY-MM-DD'),
          TCO_ES_ACTUAL = 0,
          TIC_FECHA_MODIFICACION = SYSDATE
        WHERE TCO_ID = :tco_id
      `,
      {
        fecha_fin_actual: subtractOneDay(payload.fecha_inicio),
        tco_id: currentContract.TCO_ID
      }
    );
  }

  await execute(
    `
      UPDATE EMP_EMPLEADO_CONTRATO
      SET TCO_ES_ACTUAL = 0
      WHERE EMP_ID = :emp_id
        AND TCO_ES_ACTUAL = 1
    `,
    { emp_id: empId }
  );

  await execute(
    `
      INSERT INTO EMP_EMPLEADO_CONTRATO (
        TCO_ID,
        EMP_ID,
        TIC_ID,
        TCO_FECHA_INICIO,
        TCO_FECHA_FIN,
        TCO_ESTADO,
        TCO_ES_ACTUAL,
        TCO_MOTIVO_CAMBIO,
        TIC_FECHA_MODIFICACION
      )
      VALUES (
        SEQ_CONTRATO.NEXTVAL,
        :emp_id,
        :tic_id,
        TO_DATE(:fecha_inicio, 'YYYY-MM-DD'),
        TO_DATE(:fecha_fin, 'YYYY-MM-DD'),
        'A',
        1,
        :motivo,
        SYSDATE
      )
    `,
    {
      emp_id: empId,
      tic_id: payload.tic_id,
      fecha_inicio: payload.fecha_inicio,
      fecha_fin: payload.fecha_fin,
      motivo: contractReason
    }
  );
}

/* =======================
   OBTENER EMPLEADOS
======================= */
export async function getEmpleados(req, res) {
  try {
    const sql = `
      SELECT 
        e.EMP_ID,
        e.EMP_NOMBRE,
        e.EMP_APELLIDO,
        e.EMP_DPI,
        e.EMP_NIT,
        e.EMP_TELEFONO,
        e.EMP_FOTO,
        e.EMP_FECHA_CONTRATACION,
        e.EMP_ESTADO,
        e.DEP_ID,
        e.HOR_ID,
        e.TIC_ID,
        e.CUE_ID,
        e.PUE_ID,
        e.SED_ID,
        e.PRE_ID,
        p.PUE_SALARIO_BASE AS EMP_SUELDO,
        TO_CHAR(ec.TCO_FECHA_INICIO, 'YYYY-MM-DD') AS EMP_FECHA_INICIO_CONTRATO,
        TO_CHAR(ec.TCO_FECHA_FIN, 'YYYY-MM-DD') AS EMP_FECHA_FIN_CONTRATO,
        ec.TCO_MOTIVO_CAMBIO AS EMP_MOTIVO_CAMBIO_CONTRATO
      FROM EMP_EMPLEADO e
      LEFT JOIN EMP_PUESTO p ON p.PUE_ID = e.PUE_ID
      LEFT JOIN EMP_EMPLEADO_CONTRATO ec
        ON ec.EMP_ID = e.EMP_ID
       AND ec.TCO_ES_ACTUAL = 1
      ORDER BY e.EMP_ID
    `;

    const result = await executeQuery(sql);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo empleados",
      error: error.message
    });
  }
}

/* =======================
   OBTENER POR ID
======================= */
export async function getEmpleadoById(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      SELECT
        e.EMP_ID,
        e.EMP_NOMBRE,
        e.EMP_APELLIDO,
        e.EMP_DPI,
        e.EMP_NIT,
        e.EMP_TELEFONO,
        e.EMP_FOTO,
        e.EMP_FECHA_CONTRATACION,
        e.EMP_ESTADO,
        e.DEP_ID,
        e.HOR_ID,
        e.TIC_ID,
        e.CUE_ID,
        e.PUE_ID,
        e.SED_ID,
        e.PRE_ID,
        p.PUE_SALARIO_BASE AS EMP_SUELDO,
        TO_CHAR(ec.TCO_FECHA_INICIO, 'YYYY-MM-DD') AS EMP_FECHA_INICIO_CONTRATO,
        TO_CHAR(ec.TCO_FECHA_FIN, 'YYYY-MM-DD') AS EMP_FECHA_FIN_CONTRATO,
        ec.TCO_MOTIVO_CAMBIO AS EMP_MOTIVO_CAMBIO_CONTRATO
      FROM EMP_EMPLEADO e
      LEFT JOIN EMP_PUESTO p ON p.PUE_ID = e.PUE_ID
      LEFT JOIN EMP_EMPLEADO_CONTRATO ec
        ON ec.EMP_ID = e.EMP_ID
       AND ec.TCO_ES_ACTUAL = 1
      WHERE e.EMP_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({
      message: "Error obteniendo empleado",
      error: error.message
    });
  }
}

/* =======================
   CREAR EMPLEADO
======================= */
export async function createEmpleado(req, res) {
  try {
    const {
      emp_nombre,
      emp_apellido,
      emp_dpi,
      emp_nit,
      emp_telefono,
      emp_foto,
      emp_fecha_contratacion,
      emp_estado,
      dep_id,
      hor_id,
      tic_id,
      cue_id,
      pue_id,
      sed_id,
      pre_id
    } = req.body;

    const sql = `
      INSERT INTO EMP_EMPLEADO (
        EMP_ID,
        EMP_NOMBRE,
        EMP_APELLIDO,
        EMP_DPI,
        EMP_NIT,
        EMP_TELEFONO,
        EMP_FOTO,
        EMP_FECHA_CONTRATACION,
        EMP_ESTADO,
        DEP_ID,
        HOR_ID,
        TIC_ID,
        CUE_ID,
        PUE_ID,
        SED_ID,
        PRE_ID
      )
      VALUES (
        EMP_EMPLEADO_SEQ.NEXTVAL,
        :emp_nombre,
        :emp_apellido,
        :emp_dpi,
        :emp_nit,
        :emp_telefono,
        :emp_foto,
        TO_DATE(:emp_fecha_contratacion, 'YYYY-MM-DD'),
        :emp_estado,
        :dep_id,
        :hor_id,
        :tic_id,
        :cue_id,
        :pue_id,
        :sed_id,
        :pre_id
      )
    `;

    await executeQuery(sql, {
      emp_nombre,
      emp_apellido,
      emp_dpi,
      emp_nit,
      emp_telefono,
      emp_foto: emp_foto || null,
      emp_fecha_contratacion,
      emp_estado,
      dep_id: dep_id || null,
      hor_id: hor_id || null,
      tic_id: tic_id || null,
      cue_id: cue_id || null,
      pue_id: pue_id || null,
      sed_id: sed_id || null,
      pre_id: pre_id || null
    });

    res.status(201).json({ message: "Empleado creado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error creando empleado",
      error: error.message
    });
  }
}

/* =======================
   ACTUALIZAR EMPLEADO
======================= */
export async function updateEmpleado(req, res) {
  try {
    const { id } = req.params;
    const empId = Number(id);
    const {
      emp_nombre,
      emp_apellido,
      emp_dpi,
      emp_nit,
      emp_telefono,
      emp_foto,
      emp_fecha_contratacion,
      emp_estado,
      dep_id,
      hor_id,
      tic_id,
      cue_id,
      pue_id,
      sed_id,
      pre_id
    } = req.body;

    const shouldProcessContract = hasContractPayload(req.body);

    const sql = `
      UPDATE EMP_EMPLEADO
      SET
        EMP_NOMBRE = :emp_nombre,
        EMP_APELLIDO = :emp_apellido,
        EMP_DPI = :emp_dpi,
        EMP_NIT = :emp_nit,
        EMP_TELEFONO = :emp_telefono,
        EMP_FOTO = :emp_foto,
        EMP_FECHA_CONTRATACION = TO_DATE(:emp_fecha_contratacion, 'YYYY-MM-DD'),
        EMP_ESTADO = :emp_estado,
        DEP_ID = :dep_id,
        HOR_ID = :hor_id,
        TIC_ID = :tic_id,
        CUE_ID = :cue_id,
        PUE_ID = :pue_id,
        SED_ID = :sed_id,
        PRE_ID = :pre_id
      WHERE EMP_ID = :id
    `;

    await executeTransaction(async ({ execute }) => {
      const result = await execute(sql, {
        id: empId,
        emp_nombre,
        emp_apellido,
        emp_dpi,
        emp_nit,
        emp_telefono,
        emp_foto: emp_foto || null,
        emp_fecha_contratacion,
        emp_estado,
        dep_id: dep_id || null,
        hor_id: hor_id || null,
        tic_id: tic_id || null,
        cue_id: cue_id || null,
        pue_id: pue_id || null,
        sed_id: sed_id || null,
        pre_id: pre_id || null
      });

      if (result.rowsAffected === 0) {
        throw new HttpError(404, "Empleado no encontrado");
      }

      if (shouldProcessContract) {
        if (toNumberOrNull(tic_id) === null) {
          throw new HttpError(400, "El tipo de contrato es obligatorio para cambiar contrato");
        }

        const tipoContrato = await ensureTipoContratoExists(execute, tic_id);
        const contractPayload = normalizeContractPayload(req.body, tipoContrato);
        await applyContractChange(execute, empId, contractPayload);
      }
    });

    res.json({ message: "Empleado actualizado correctamente" });
  } catch (error) {
    res.status(error.status || 500).json({
      message: "Error actualizando empleado",
      error: error.message
    });
  }
}

/* =======================
   ELIMINAR EMPLEADO
======================= */
export async function deleteEmpleado(req, res) {
  try {
    const { id } = req.params;

    const sql = `
      UPDATE EMP_EMPLEADO
      SET EMP_ESTADO = 'I'
      WHERE EMP_ID = :id
    `;

    const result = await executeQuery(sql, { id: Number(id) });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ message: "Empleado no encontrado" });
    }

    res.json({ message: "Empleado inactivado correctamente" });
  } catch (error) {
    res.status(500).json({
      message: "Error eliminando empleado",
      error: error.message
    });
  }
}

/* =======================
   ELIMINAR EMPLEADO PERMANENTE
======================= */
export async function deleteEmpleadoPermanente(req, res) {
  try {
    const { id } = req.params;
    const empId = Number(id);

    if (!Number.isFinite(empId)) {
      return res.status(400).json({ message: "ID de empleado invalido" });
    }

    const deletedSummary = await executeTransaction(async ({ execute }) => {
      const empleado = await execute(
        `
          SELECT EMP_ID
          FROM EMP_EMPLEADO
          WHERE EMP_ID = :id
          FOR UPDATE
        `,
        { id: empId }
      );

      if (empleado.rows.length === 0) {
        throw new HttpError(404, "Empleado no encontrado");
      }

      const deletedSummary = [];

      await updateEmployeeReferenceToNull(execute, empId, "CUE_ID");
      await updateEmployeeReferenceToNull(execute, empId, "PRE_ID");

      await deletePayrollForEmployee(execute, empId, deletedSummary);
      await deleteLoansForEmployee(execute, empId, deletedSummary);
      await deleteUsersForEmployee(execute, empId, deletedSummary);

      for (const dependency of EMPLOYEE_DIRECT_DELETE_DEPENDENCIES) {
        await deleteIfColumnExists(
          execute,
          dependency.table,
          dependency.column || "EMP_ID",
          empId,
          deletedSummary,
          dependency.label
        );
      }

      const contratoResult = await execute(
        `
          DELETE FROM EMP_EMPLEADO_CONTRATO
          WHERE EMP_ID = :id
        `,
        { id: empId }
      );

      if (Number(contratoResult.rowsAffected || 0) > 0) {
        deletedSummary.push(`contratos: ${contratoResult.rowsAffected}`);
      }

      const result = await execute(
        `
          DELETE FROM EMP_EMPLEADO
          WHERE EMP_ID = :id
        `,
        { id: empId }
      );

      if (result.rowsAffected === 0) {
        throw new HttpError(404, "Empleado no encontrado");
      }

      deletedSummary.push("empleado: 1");

      return deletedSummary;
    });

    res.json({
      message: "Empleado y registros relacionados eliminados correctamente",
      eliminados: deletedSummary
    });
  } catch (error) {
    const isIntegrityError = String(error.message || "").includes("ORA-02292");
    res.status(error.status || (isIntegrityError ? 409 : 500)).json({
      message: "Error eliminando empleado definitivamente",
      error: isIntegrityError
        ? "No se pudo eliminar automaticamente una relacion del empleado. Revisa si existe una tabla relacionada que no esta contemplada en el borrado en cascada."
        : error.message
    });
  }
}
