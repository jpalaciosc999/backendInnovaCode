-- Conceptos minimos para que la generacion de nomina clasifique la planilla.
-- Ejecutar una vez. Los MERGE evitan duplicados por codigo.

MERGE INTO EMP_INGRESO t
USING (SELECT 'SALARIO' codigo, 'Salario base' nombre, 'Salario ordinario del empleado' descripcion, 0 valor, 'N' recurrente FROM DUAL) s
ON (UPPER(t.TIS_CODIGO) = s.codigo)
WHEN NOT MATCHED THEN
  INSERT (TIS_ID, TIS_CODIGO, TIS_NOMBRE, TIS_DESCRIPCION, TIS_VALOR_BASE, TIS_ES_RECURRENTE, FECHA_MODIFICACION)
  VALUES (EMP_INGRESO_SEQ.NEXTVAL, s.codigo, s.nombre, s.descripcion, s.valor, s.recurrente, SYSDATE);

MERGE INTO EMP_INGRESO t
USING (SELECT 'BONIF-INC' codigo, 'Bonificacion incentivo' nombre, 'Bonificacion Decreto 37-2001 u otra bonificacion fija' descripcion, 250 valor, 'N' recurrente FROM DUAL) s
ON (UPPER(t.TIS_CODIGO) = s.codigo)
WHEN NOT MATCHED THEN
  INSERT (TIS_ID, TIS_CODIGO, TIS_NOMBRE, TIS_DESCRIPCION, TIS_VALOR_BASE, TIS_ES_RECURRENTE, FECHA_MODIFICACION)
  VALUES (EMP_INGRESO_SEQ.NEXTVAL, s.codigo, s.nombre, s.descripcion, s.valor, s.recurrente, SYSDATE);

MERGE INTO EMP_INGRESO t
USING (SELECT 'HORA-EXTRA' codigo, 'Horas extra' nombre, 'Sueldo extraordinario calculado desde marcajes autorizados' descripcion, 0 valor, 'N' recurrente FROM DUAL) s
ON (UPPER(t.TIS_CODIGO) = s.codigo)
WHEN NOT MATCHED THEN
  INSERT (TIS_ID, TIS_CODIGO, TIS_NOMBRE, TIS_DESCRIPCION, TIS_VALOR_BASE, TIS_ES_RECURRENTE, FECHA_MODIFICACION)
  VALUES (EMP_INGRESO_SEQ.NEXTVAL, s.codigo, s.nombre, s.descripcion, s.valor, s.recurrente, SYSDATE);

MERGE INTO EMP_INGRESO t
USING (SELECT 'COMISION' codigo, 'Comision / KPI' nombre, 'Comisiones y montos generados por KPI' descripcion, 0 valor, 'N' recurrente FROM DUAL) s
ON (UPPER(t.TIS_CODIGO) = s.codigo)
WHEN NOT MATCHED THEN
  INSERT (TIS_ID, TIS_CODIGO, TIS_NOMBRE, TIS_DESCRIPCION, TIS_VALOR_BASE, TIS_ES_RECURRENTE, FECHA_MODIFICACION)
  VALUES (EMP_INGRESO_SEQ.NEXTVAL, s.codigo, s.nombre, s.descripcion, s.valor, s.recurrente, SYSDATE);

MERGE INTO EMP_INGRESO t
USING (SELECT 'OTRO-ING' codigo, 'Otros ingresos' nombre, 'Ingresos variables que no son salario, bonificacion, horas extra ni comision' descripcion, 0 valor, 'N' recurrente FROM DUAL) s
ON (UPPER(t.TIS_CODIGO) = s.codigo)
WHEN NOT MATCHED THEN
  INSERT (TIS_ID, TIS_CODIGO, TIS_NOMBRE, TIS_DESCRIPCION, TIS_VALOR_BASE, TIS_ES_RECURRENTE, FECHA_MODIFICACION)
  VALUES (EMP_INGRESO_SEQ.NEXTVAL, s.codigo, s.nombre, s.descripcion, s.valor, s.recurrente, SYSDATE);

MERGE INTO EMP_DESCUENTO t
USING (SELECT 'IGSS-LAB' codigo, 'IGSS laboral' nombre, 'Cuota laboral IGSS calculada automaticamente en nomina' descripcion, 'PORCENTAJE' tipo, 0 valor, 4.83 porcentaje, 'S' obligatorio, 'A' estado FROM DUAL) s
ON (UPPER(t.TDS_CODIGO) = s.codigo)
WHEN NOT MATCHED THEN
  INSERT (TDS_ID, TDS_CODIGO, TDS_NOMBRE, TDS_DESCRIPCION, TDS_TIPO_CALCULO, TDS_VALOR_BASE, TDS_PORCENTAJE, TDS_ES_OBLIGATORIO, TDS_ESTADO, TDS_FECHA_CREACION, TDS_MODIFICACION)
  VALUES (EMP_DESCUENTO_SEQ.NEXTVAL, s.codigo, s.nombre, s.descripcion, s.tipo, s.valor, s.porcentaje, s.obligatorio, s.estado, SYSDATE, SYSDATE);

MERGE INTO EMP_DESCUENTO t
USING (SELECT 'ISR' codigo, 'ISR' nombre, 'ISR calculado automaticamente segun base salarial' descripcion, 'PORCENTAJE' tipo, 0 valor, 0 porcentaje, 'S' obligatorio, 'A' estado FROM DUAL) s
ON (UPPER(t.TDS_CODIGO) = s.codigo)
WHEN NOT MATCHED THEN
  INSERT (TDS_ID, TDS_CODIGO, TDS_NOMBRE, TDS_DESCRIPCION, TDS_TIPO_CALCULO, TDS_VALOR_BASE, TDS_PORCENTAJE, TDS_ES_OBLIGATORIO, TDS_ESTADO, TDS_FECHA_CREACION, TDS_MODIFICACION)
  VALUES (EMP_DESCUENTO_SEQ.NEXTVAL, s.codigo, s.nombre, s.descripcion, s.tipo, s.valor, s.porcentaje, s.obligatorio, s.estado, SYSDATE, SYSDATE);

MERGE INTO EMP_DESCUENTO t
USING (SELECT 'PRESTAMO' codigo, 'Prestamo' nombre, 'Cuota de prestamo del empleado' descripcion, 'FIJO' tipo, 0 valor, 0 porcentaje, 'N' obligatorio, 'A' estado FROM DUAL) s
ON (UPPER(t.TDS_CODIGO) = s.codigo)
WHEN NOT MATCHED THEN
  INSERT (TDS_ID, TDS_CODIGO, TDS_NOMBRE, TDS_DESCRIPCION, TDS_TIPO_CALCULO, TDS_VALOR_BASE, TDS_PORCENTAJE, TDS_ES_OBLIGATORIO, TDS_ESTADO, TDS_FECHA_CREACION, TDS_MODIFICACION)
  VALUES (EMP_DESCUENTO_SEQ.NEXTVAL, s.codigo, s.nombre, s.descripcion, s.tipo, s.valor, s.porcentaje, s.obligatorio, s.estado, SYSDATE, SYSDATE);

MERGE INTO EMP_DESCUENTO t
USING (SELECT 'ANTICIPO' codigo, 'Anticipo de nomina' nombre, 'Anticipo de salario asignado al periodo' descripcion, 'FIJO' tipo, 0 valor, 0 porcentaje, 'N' obligatorio, 'A' estado FROM DUAL) s
ON (UPPER(t.TDS_CODIGO) = s.codigo)
WHEN NOT MATCHED THEN
  INSERT (TDS_ID, TDS_CODIGO, TDS_NOMBRE, TDS_DESCRIPCION, TDS_TIPO_CALCULO, TDS_VALOR_BASE, TDS_PORCENTAJE, TDS_ES_OBLIGATORIO, TDS_ESTADO, TDS_FECHA_CREACION, TDS_MODIFICACION)
  VALUES (EMP_DESCUENTO_SEQ.NEXTVAL, s.codigo, s.nombre, s.descripcion, s.tipo, s.valor, s.porcentaje, s.obligatorio, s.estado, SYSDATE, SYSDATE);

MERGE INTO EMP_DESCUENTO t
USING (SELECT 'JUDICIAL' codigo, 'Descuento judicial' nombre, 'Pension alimenticia, embargo u otro descuento judicial asignado al empleado' descripcion, 'FIJO' tipo, 0 valor, 0 porcentaje, 'N' obligatorio, 'A' estado FROM DUAL) s
ON (UPPER(t.TDS_CODIGO) = s.codigo)
WHEN NOT MATCHED THEN
  INSERT (TDS_ID, TDS_CODIGO, TDS_NOMBRE, TDS_DESCRIPCION, TDS_TIPO_CALCULO, TDS_VALOR_BASE, TDS_PORCENTAJE, TDS_ES_OBLIGATORIO, TDS_ESTADO, TDS_FECHA_CREACION, TDS_MODIFICACION)
  VALUES (EMP_DESCUENTO_SEQ.NEXTVAL, s.codigo, s.nombre, s.descripcion, s.tipo, s.valor, s.porcentaje, s.obligatorio, s.estado, SYSDATE, SYSDATE);

MERGE INTO EMP_DESCUENTO t
USING (SELECT 'OTRO-EGR' codigo, 'Otros egresos' nombre, 'Parqueo u otros descuentos variables asignados al periodo' descripcion, 'FIJO' tipo, 0 valor, 0 porcentaje, 'N' obligatorio, 'A' estado FROM DUAL) s
ON (UPPER(t.TDS_CODIGO) = s.codigo)
WHEN NOT MATCHED THEN
  INSERT (TDS_ID, TDS_CODIGO, TDS_NOMBRE, TDS_DESCRIPCION, TDS_TIPO_CALCULO, TDS_VALOR_BASE, TDS_PORCENTAJE, TDS_ES_OBLIGATORIO, TDS_ESTADO, TDS_FECHA_CREACION, TDS_MODIFICACION)
  VALUES (EMP_DESCUENTO_SEQ.NEXTVAL, s.codigo, s.nombre, s.descripcion, s.tipo, s.valor, s.porcentaje, s.obligatorio, s.estado, SYSDATE, SYSDATE);

COMMIT;
