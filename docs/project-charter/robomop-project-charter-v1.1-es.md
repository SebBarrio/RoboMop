# Project Charter — RoboMop New Era

**Versión:** 1.1 para aprobación provisional

**Fecha de emisión:** 3 de agosto de 2026

**Duración autorizada propuesta:** 16 semanas a partir del Notice to Proceed

**Estado:** Baseline revisado para presentación y firma provisional

| Rol | Nombre |
|---|---|
| Sponsor | Luis Vazquez |
| Project Manager | Germán Velázquez |
| Senior Engineer | Sebastian Barrio |

---

## 1. Propósito y autorización

Este Project Charter autoriza la ejecución de un programa de 16 semanas para desarrollar RoboMop como un producto autónomo de limpieza, integrado y verificable. El proyecto reemplaza la arquitectura 2025; conserva sus resultados únicamente como evidencia, fuente de fallos y requisitos de prevención.

El resultado será el producto final correspondiente al alcance de esta fase: una unidad completa que demuestre arquitectura, integración, seguridad funcional, autonomía energética, navegación, percepción, irrigación y conectividad. **No contará con homologación en esta fase.**

La firma provisional de este Charter, acompañada de una confirmación escrita de **luz verde / Notice to Proceed (NTP)** emitida por el Sponsor, autoriza al Project Manager a iniciar la Semana 1, ejecutar el alcance, coordinar las compras que el Sponsor pagará, solicitar uso de contingencia y detener trabajo ante riesgos de seguridad. La Semana 1 comienza el primer día hábil posterior a que existan ambos actos: firma provisional y NTP. Antes del NTP no corre el calendario de 16 semanas ni existe autorización para comprometer compras.

---

## 2. Caso de negocio

El prototipo 2025 confirmó la viabilidad general, pero también expuso limitaciones que impiden conservar su arquitectura como baseline:

- autonomía de 25–30 minutos;
- conectores de alta corriente intermitentes;
- sobrecalentamiento de puente H después de motor runaway;
- conexiones de encoder poco confiables;
- competencia entre cómputo de alto nivel y control en tiempo real;
- desincronización LiDAR–odometría–IMU;
- deriva y offsets de mapa;
- integración incompleta de irrigación;
- discrepancias entre claims finales y evidencia tardía de mapeo.

La nueva etapa convierte esas lecciones en requisitos, arquitectura separada, pruebas por subsistema y evidencia repetible. El objetivo de negocio es entregar el producto final de esta fase y generar una base técnica que permita evaluar posteriormente su expansión de fabricación hasta 10 unidades.

---

## 3. Objetivos medibles

| ID | Objetivo | Criterio de éxito |
|---|---|---|
| OBJ-01 | Entregar el producto final del proyecto en 16 semanas | Final Acceptance Test y handoff en Semana 16 |
| OBJ-02 | Controlar el costo del proyecto | Hardware base MXN $49,739.85; contingencia Sponsor MXN $7,460.98; forecast de hardware MXN $57,200.83; Project Manager MXN $160,000; Senior Engineer MXN $160,000; servicios totales MXN $320,000; presupuesto total planeado MXN $377,200.83 |
| OBJ-03 | Demostrar autonomía energética | ≥4.0 h desde 100% de carga bajo perfil de aceptación de 200 W promedio worst case |
| OBJ-04 | Demostrar intercambio de acumulador | Swap ≤5 min, sin reinicio de controles; respaldo objetivo de diseño ≥10 min, a confirmar en SRR |
| OBJ-05 | Demostrar movimiento seguro | E-stop, watchdog, command timeout, motor inhibit y respuesta controlada a fallas |
| OBJ-06 | Demostrar autonomía | Mapeo, localización, navegación, replanning y cobertura contra matriz congelada en SRR |
| OBJ-07 | Integrar percepción | Dos cámaras, LiDAR, IMU y sensores auxiliares calibrados y timestamped |
| OBJ-08 | Integrar irrigación | Control de flujo/nivel, leak behavior y operación conjunta con la misión |
| OBJ-09 | Integrar conectividad | Backend/frontend, telemetría, comandos, recuperación de red y logging |
| OBJ-10 | Generar evidencia de intención productiva | BoM, revisiones, serialización, fixtures y pruebas repetibles aplicables a una fase posterior de hasta 10 unidades |

La matriz provisional de aceptación incluida en este Charter define la barra inicial de éxito. En el SRR de Semana 1 sólo podrá completarse el método, ambiente e instrumentación o modificarse una cifra mediante Change Class 3 aprobada por el Sponsor, PM y Senior Engineer. Ninguna métrica podrá relajarse después de observar resultados.

### 3.1 Matriz provisional de aceptación y trazabilidad contractual

| ID | Requisito / entregable | Umbral provisional | Método / evidencia | Repetición | Waiver |
|---|---|---|---|---:|---|
| ACC-01 | Entrega integrada | 1 robot, 1 acumulador LFP, 1 cargador, software y paquete técnico completo | Inspección y acta de entrega | 1 | No para faltantes obligatorios |
| ACC-02 | Autonomía energética | ≥4.0 h desde 100% bajo perfil promedio de 200 W; modelo de planeación 960 Wh / 200 W = 4.8 h y 20% sobre la energía requerida de 800 Wh | Log de energía, SoC, voltajes, temperaturas, potencia y eventos; validación interna previa + FAT presenciada | 1 FAT después de validación interna | No |
| ACC-03 | Cambio de acumulador | ≤5 min; controles activos; sin arco, reinicio ni pérdida de estado | Cronómetro, video y log de controles | 3 | No si existe condición insegura |
| ACC-04 | Paro e inhibición | E-stop e inhibit llevan las salidas de tracción al estado seguro, impiden rearranque automático y requieren reset deliberado; tiempo/distancia se congelan en SRR antes de pruebas móviles | Osciloscopio/log, video y fault injection | Cada modo/falla | No |
| ACC-05 | Movimiento no controlado | 0 eventos durante verificación y FAT | Hazard/defect log y pruebas de stale command, network loss, brownout, reset y sensor failure | Matriz completa | No |
| ACC-06 | Navegación y cobertura | ≥95% del área alcanzable del circuito acordado; 0 colisiones; misión completada en ≥9/10 corridas | Ground truth, mapa, rosbag y reporte de cobertura | 10 | Sólo Class 3, nunca para colisión insegura |
| ACC-07 | Localización | Error RMS ≤0.20 m y relocalización ≤30 s en el circuito acordado | Ground truth + rosbag + reporte | 3 corridas | Class 3 antes de FAT |
| ACC-08 | Limpieza e irrigación | ≥90% de remoción del patrón de suciedad acordado; flujo dentro de ±15% del setpoint; 0 fugas hacia electrónica y sin charcos fuera del límite acordado | Protocolo before/after, medición de flujo, inspección y leak test | 3 zonas | No para fuga hacia electrónica |
| ACC-09 | Percepción | Detecta las clases congeladas en SRR con ≥90% recall y ≤10% falsos positivos en el dataset/circuito acordado | Dataset versionado, replay y pruebas físicas | Dataset + 3 corridas | Class 3 antes de FAT |
| ACC-10 | Conectividad | Reconexión y recuperación de estado ≤60 s; ≥99% de telemetría esperada registrada durante FAT | Logs backend/robot y prueba de pérdida/retorno de red | 3 ciclos | Class 3 antes de FAT |
| ACC-11 | Seguridad eléctrica y térmica | Sin trips inesperados, celdas fuera de límites, conductores/conectores sobre su rating ni acceso de agua a electrónica | Logs térmicos/eléctricos, inspección, leak/fault tests | Matriz completa | No |
| ACC-12 | Documentación | 100% de CAD/STL, BoM, source, binaries, configuración, calibraciones, resultados, manuales y known issues entregados y versionados | Checklist de configuración y archivo de release | 1 | P2 sólo para corrección editorial |

Los valores de ACC-06 a ACC-10 son una **propuesta inicial para decisión** en la presentación y firma provisional. Si una cifra no es aceptada, deberá reemplazarse por un valor explícito antes de liberar compras irreversibles dependientes de ella.

---

## 4. Alcance

### 4.1 Incluido

- Requisitos, arquitectura, ICD, matriz de aceptación y hazard/FMEA.
- Desensamble forense del sistema 2025.
- Chasis funcional impreso en 3D, mounts, packaging y drivetrain de dos motores conforme a la propuesta vigente.
- Un acumulador LFP completo como entrega mínima, BMS sourced y cargador compatible.
- Hot swap ≤5 min y continuidad de controles durante el cambio.
- Arquitectura de cómputo y control separada, con PCB(s) de potencia/control fabricadas o ensambladas en China.
- NVIDIA Jetson Orin Nano 8GB Super Dev Kit y SSD NVMe 256 GB como baseline seleccionado.
- Control determinista de bajo nivel con watchdogs, safe states y motor inhibit.
- Dos cámaras, dos RPLIDAR S2, IMU, cliff/ToF, bump, nivel/flujo/fuga, corriente y temperatura.
- ROS 2, Isaac Sim e Isaac ROS para gemelo digital y validación anticipada.
- Mapeo, localización, navegación, cobertura y percepción por cámara.
- Irrigación integrada.
- Backend, frontend, conectividad, alertas, logs y recuperación de estado.
- Pruebas digitales, de banco, subsistema, integración, fault injection, regresión y aceptación.
- CAD/STL, BoM, código, firmware, configuración, calibración, procedimientos, evidencia y manuales.

### 4.2 Fuera de alcance

- Homologación regulatoria del producto en esta fase.
- Tooling definitivo, moldes, chasis metálico o enclosure de producción.
- Expansión de fabricación a unidades adicionales, la cual será evaluada como una fase posterior.
- Flota comercial completa, operación 24/7 o infraestructura cloud a escala.
- Segunda o múltiples iteraciones completas de PCB de producción.
- Garantía de desempeño fuera del ambiente y perfiles congelados en SRR.
- Servicios, obligaciones o garantías posteriores a los 16 semanas, salvo que se pacten en el contrato futuro.

---

## 5. Entregables

1. Un robot RoboMop final, funcional e integrado conforme al alcance aprobado.
2. Un acumulador LFP funcional como mínimo y un cargador compatible.
3. Chasis funcional impreso en 3D conforme a la propuesta aprobada y drivetrain de dos motorreductores instalado.
4. Electrónica high-/low-level, arneses, conectores y dispositivos de seguridad.
5. Suite de sensores nueva: dos cámaras, dos RPLIDAR S2, IMU y sensores auxiliares.
6. Sistema de irrigación integrado.
7. Firmware, ROS 2, autonomía, percepción y software de misión.
8. Backend/frontend y conectividad requeridos para aceptación.
9. Gemelo digital y escenarios reproducibles en Isaac.
10. Matriz de verificación con resultados y datos crudos.
11. CAD/STL, BoM, source, binaries, configuration y calibration records.
12. Risk, issue, decision, change y defect logs.
13. Manual de operación, carga, swap, mantenimiento y seguridad.
14. Informe final con recomendaciones para la siguiente fase y hasta 10 unidades.

---

## 6. Baseline técnico de planeación

| Subsistema | Baseline | Estado |
|---|---|---|
| Compute | NVIDIA Jetson Orin Nano 8GB Super Dev Kit + SSD NVMe 256 GB | Seleccionado conforme a la propuesta; PDR confirma interfaces y configuración |
| Control | ESP32-S3-WROOM-1 N16R8 | Seleccionado conforme a la propuesta; PDR confirma interfaces y seguridad |
| Arquitectura | Tier de alto nivel separado del control determinista | Requisito arquitectónico |
| Acumulador | 16 celdas LiFePO4 40135, 3.2 V/20 Ah, 8S2P, 25.6 V, 40 Ah, 1.024 kWh nominales | Celdas seleccionadas conforme a propuesta; validar muestra y assembly |
| Energía operativa del modelo | 960 Wh; 800 Wh requeridos para 4 h a 200 W; reserva del modelo 160 Wh / 20% | Baseline de planeación aprobado; requiere correlación física sin reducir el criterio ≥4 h |
| Drivetrain | 2 × 60GP-60ZYT24X0SZ-B, 24 V, 100 W, 1:18, 270 rpm, encoder 500 ppr | Seleccionado conforme a la propuesta; PDR valida torque, freno, integración y duty cycle |
| Percepción | 2 cámaras + 2 × RPLIDAR S2 + IMU | LiDAR seleccionado; cámaras/IMU se congelan en PDR dentro de sus cuentas |
| Cliff/proximidad | Cuatro ToF-class + bump sensors | Baseline de desarrollo, no safety-rated |
| Simulación | ROS 2 + Isaac Sim/Isaac ROS | Requerido antes de pruebas autónomas físicas |
| Chasis | Impresión 3D funcional conforme a la propuesta vigente | Producto final de esta fase; homologación no incluida |

El peso propuesto de 7.29 kg para el acumulador es un objetivo preliminar y debe incluir enclosure, BMS, protección, conector, asas, guías y tolerancias antes de aceptarse.

---

## 7. Organización y gobierno

### Sponsor — Luis Vazquez

- Aprueba Charter, BAC, uso de contingencia y cambios Class 3.
- Resuelve excepciones de alcance, costo y calendario.
- Presencia obligatoria en gates y aceptación final.

### Project Manager — Germán Velázquez

- Responsable de alcance, calendario, costo, BoM, procurement, riesgos, cambios, releases y documentación.
- Apoya mecánica, electricidad, acumulador, ensamble, integración y pruebas.
- Coordina el workstream de software, pero no ejecuta desarrollo de software.

### Senior Engineer — Sebastian Barrio

- Responsable de arquitectura, interfaces, decisiones técnicas, integración mecánica/eléctrica, acumulador/potencia, liberación técnica de PCBs, firmware, software, ROS/Isaac, autonomía, percepción y evidencia técnica.

### Autoridad de seguridad

Germán y Sebastian pueden detener inmediatamente cualquier prueba por movimiento no controlado, anomalía de batería/BMS, calentamiento de conectores, riesgo eléctrico, fuga de agua o condición insegura.

### RACI ejecutivo

| Work package | Sponsor | PM | Senior Engineer |
|---|---|---|---|
| Charter, alcance y presupuesto | A | R | C |
| Requisitos y aceptación | I | A/R | R |
| Arquitectura e interfaces | I | C | A/R |
| Compras y costo | A en excepciones | A/R | C |
| Chasis y drivetrain | I | R/soporte | A/R |
| Acumulador, hot swap y seguridad | I | R/soporte | A/R |
| Electrónica y firmware | I | C hardware / I firmware | A/R |
| ROS, autonomía, percepción y app | I | I/coordinación | A/R |
| Integración y verificación | I | A/R coordinación | R técnico |
| Aceptación final | A | R | C/evidencia |

---

## 8. Plan integrado de 16 semanas

| Fase | Semanas | Resultado de salida |
|---|---:|---|
| Autorización, requisitos y SRR | 1 | Charter, requisitos, aceptación, hazards y evidencia 2025 |
| Arquitectura, PDR y compras | 2 | Arquitectura/ICD congelados y long-lead orders liberadas |
| Diseño concurrente y simulación | 3–4 | CAD, hot swap design, PCB package, Isaac baseline |
| Construcción y pruebas de subsistema | 5–8 | Battery bench, drivetrain, irrigación, control, sensores y PCB bring-up |
| Integración incremental | 8–12 | Rolling chassis, sensores, autonomía, irrigación, app y misión completa |
| Feature Freeze | fin de 12 | Sin nuevo scope; sistema completo configurado |
| Verificación | 13–14 | Campañas de energía/seguridad y autonomía/limpieza/conectividad |
| Corrección y regresión | 15 | Acceptance blockers cerrados y release candidate |
| Aceptación y entrega | 16 | FAT, documentación, handoff y firma |

### Gates

| Gate | Momento | Criterio |
|---|---:|---|
| G0 | Inicio | Charter provisional firmado y NTP/luz verde escrita del Sponsor |
| G1 — SRR | Fin W1 | Requisitos, matriz de aceptación, hazards y ambiente de FAT congelados |
| G2 — PDR | Fin W2 | Arquitectura, interfaces, cotizaciones landed, sourcing y long-leads aprobados |
| G3 — Subsystem Readiness | Fin W8 | Evidencia cuantitativa de cada subsistema aprobada contra su matriz |
| G4 — Feature Complete | Fin W12 | Robot integrado; configuración identificada; feature freeze |
| G5 — Verification Complete | Fin W14 | 100% de pruebas obligatorias ejecutadas; P0 = 0; plan cerrado para cualquier P1 |
| G6 — Final Release | W16 | Todos los requisitos no dispensables aprobados, entrega aceptada y riesgos no críticos documentados |

Cada gate se registra como **Pass, Conditional Pass o Fail**, con entradas, evidencia, aprobadores, condiciones, owner y fecha de cierre. Un Conditional Pass no puede liberar trabajo que dependa de un hazard crítico abierto. Sponsor, PM y Senior Engineer tienen dos días hábiles para emitir su decisión; un retraso de aprobación fuera de ese plazo desplaza el calendario en la misma cantidad de días, salvo recovery plan acordado.

### Ruta crítica

`Charter → SRR → PDR → PCBs/long leads → recepción → bring-up → power/drivetrain seguro → calibración/localización → integración completa → verificación → regresión → FAT`

Cualquier retraso mayor a tres días laborables sobre la ruta crítica requiere un recovery plan y decisión del PM; dos sprints consecutivos incumplidos requieren revisión de alcance o recursos con el Sponsor.

---

## 9. Presupuesto y administración de compras

| Cuenta | Base MXN |
|---|---:|
| Jetson + SSD | $8,500.00 |
| Acumulador + BMS | $10,000.00 |
| Dos motores/drivetrain | $6,999.85 |
| ESP32-S3-WROOM-1 N16R8 | $122.00 |
| Dos PCBs ensambladas conforme a la propuesta (USD $160 + USD $180 a MXN $18/USD) | $6,120.00 |
| Dos cámaras | $2,198.00 |
| LiDAR, IMU y sensores auxiliares nuevos | $8,300.00 |
| Irrigación | $1,200.00 |
| Chasis 3D y consumibles mecánicos | $1,000.00 |
| Arneses, conectores y seguridad | $1,500.00 |
| Testing, logística y consumibles | $1,800.00 |
| Cargador, respaldo y hot swap | $2,000.00 |
| **Hardware estimado base** | **$49,739.85** |
| Contingencia de hardware controlada por el Sponsor, 15% | **$7,460.98** |
| **Forecast de hardware con contingencia** | **$57,200.83** |
| **Techo recomendado de hardware, sujeto a aprobación** | **$58,000.00** |
| Servicios profesionales — Project Manager | **$160,000.00** |
| Servicios profesionales — Senior Engineer | **$160,000.00** |
| **Servicios profesionales totales** | **$320,000.00** |
| **Presupuesto total planeado del proyecto** | **$377,200.83** |
| **Autorización máxima propuesta, hardware + servicios** | **$378,000.00** |

La cuenta de hardware es un **presupuesto del proyecto**, no un precio fijo ni un anticipo al equipo. El Sponsor pagará el hardware conforme se autoricen las compras, ya sea directamente al proveedor o mediante reembolso contra factura, CFDI, recibo o ticket válido y evidencia de recepción. La contingencia pertenece al Sponsor, sólo se utiliza contra riesgos materializados y cualquier remanente permanece con el Sponsor; no financia scope opcional.

Los servicios profesionales se presupuestan por separado: **MXN $160,000 para el Project Manager** y **MXN $160,000 para el Senior Engineer**, para un total de **MXN $320,000** durante el desarrollo completo de 16 semanas. La facturación, hitos y fechas de pago de cada rol se pactarán en el contrato futuro; no se cargan a las cuentas de hardware ni a su contingencia. El Sponsor absorberá y procesará el IVA, retenciones u otras cargas fiscales aplicables conforme al contrato y la legislación correspondiente.

IVA, impuestos, retenciones, importación, aranceles, brokerage, envío y variación cambiaria asociados a compras autorizadas serán absorbidos por el Sponsor. Antes de cada compra, el PM presentará al Sponsor costo esperado, impuestos/logística conocidos, proveedor, alternativa y escenario recomendado. El Sponsor aprobará por escrito uno de los siguientes escenarios: **(A)** pago directo; **(B)** reembolso documentado; **(C)** sustitución equivalente; o **(D)** uso de contingencia. Todas las compras se registrarán en un ledger con cuenta, fecha, autorización, factura/ticket, importe, impuesto, tipo de cambio, recepción y saldo.

No existe obligación de pagar por adelantado el hardware como suma global. Las compras de entrega larga se programarán desde W1–W2, pero ninguna compra crítica se libera sin NTP, autorización escrita del Sponsor, part number, interface check, rating, lead time, costo puesto en destino y escenario de proveedor.

---

## 10. Riesgos prioritarios

| ID | Riesgo | Nivel inicial | Respuesta principal | Trigger |
|---|---|---|---|---|
| R01 | Calendario de 16 semanas comprimido | Rojo | Freeze W2/W12, trabajo paralelo, WIP limitado | Slip crítico >3 días |
| R02 | Equipo de sólo dos personas | Rojo | Prioridad a ruta crítica, automatización, 20% capacidad para rework | Dos sprints incumplidos |
| R03 | PCBs/componentes tardíos | Rojo | Orden temprana, tracking y dev-module fallback | Amenaza a G3 |
| R04 | Datos de celda o masa incorrectos | Rojo | Datasheet, part number y muestra física W1 | Cualquier discrepancia |
| R05 | Consumo promedio >200 W | Rojo | Instrumentación temprana y energy model correlacionado | Forecast >212 W |
| R06 | Hot swap, conector o backup inestable | Rojo | Locking connector, inrush/thermal/cycle tests | Reset, arco o calentamiento |
| R07 | Timestamp/frame errors | Rojo | Timebase único, source timestamps, replay/calibration | Offset de mapa visible |
| R08 | Simulación no correlacionada | Rojo | Provenance y correlation gates | Error fuera de tolerancia |
| R09 | Irrigación fuga hacia electrónica | Rojo | Segregación, drip paths, sensor y bench leak test | Cualquier fuga |
| R10 | Scope/software excede capacidad | Rojo | Congelar clases/contratos, priorizar acceptance path | Integración incompleta W10 |
| R11 | EAC de hardware excede autorización | Rojo | Cotizaciones landed, ledger semanal y contingencia controlada | Forecast >$58,000 |
| R12 | Movimiento no controlado | Rojo / crítico | Hardware inhibit, E-stop, watchdog, revisión técnica y staged tests | Un evento: stop-work y P0 |

Los riesgos rojos se revisan semanalmente; los hazards de seguridad se escalan de inmediato.

---

## 11. Estrategia de calidad, prueba y aceptación

### Niveles de verificación

1. **Digital:** unit tests, contract tests, static analysis, Isaac scenarios y log replay.
2. **Banco:** acumulador, potencia, BMS, control, motores, sensores, irrigación y comunicaciones.
3. **Subsistema:** drivetrain, hot-swap, irrigación y localización.
4. **Integrado:** robot completo en condiciones normales y de falla.
5. **Aceptación:** ejecución presenciada de la matriz congelada.

La simulación no sustituye aceptación física de runtime, temperatura, conectores, hot swap, frenado, fugas, integridad estructural ni seguridad eléctrica.

### Campañas obligatorias

- Cuatro horas continuas bajo el perfil de 200 W.
- Swap ≤5 minutos y continuidad de controles.
- E-stop, watchdog, stale command, network loss, brownout, reset, pack removal y sensor failure.
- Mapeo repetible, timestamps, frames y relocalización.
- Navegación, replanning, restricted zones y cobertura.
- Percepción de clases congeladas y comportamiento seguro ante incertidumbre.
- Irrigación: flujo, nivel, fuga, clog y dry-run.
- Backend/frontend: comandos, estado, mapas, reconnect, alertas y logs.
- Regresión completa antes del release.

### Criterios mínimos de aceptación final

- Runtime ≥4.0 h desde 100% bajo perfil acordado de 200 W.
- Sin trips inesperados del BMS, undervoltage de celda, sobretemperatura o reinicio.
- Sin calentamiento inaceptable o contacto intermitente del conector.
- Swap ≤5 min y controles activos durante el cambio.
- Cero defectos P0 abiertos y cierre técnico de todos los hazards críticos.
- Cero defectos P1 abiertos, salvo disposición conjunta escrita del Sponsor y Senior Engineer que confirme ausencia de impacto en seguridad y establezca corrección en ≤10 días hábiles.
- 100% de requisitos obligatorios y de la matriz de autonomía, percepción, irrigación, conectividad y seguridad aprobados; no basta con ejecutarlos.
- Robot, acumulador, cargador, software y technical data package entregados.

### Severidad, waiver y retest

- **P0 — crítico / release blocker:** condición con potencial de lesión, movimiento no controlado, pérdida de E-stop/inhibit, evento térmico/eléctrico de batería, agua en electrónica, corrupción que invalide evidencia o incumplimiento de un requisito no dispensable. Requiere stop-work, análisis de causa, corrección, regresión y cierre técnico; no admite waiver comercial.
- **P1 — mayor:** incumplimiento de función o umbral obligatorio sin hazard crítico. Debe cerrarse antes de FAT; excepcionalmente puede aceptarse con decisión escrita Sponsor + Senior Engineer, justificación, impacto, workaround y fecha de corrección ≤10 días hábiles.
- **P2 — menor:** defecto cosmético, editorial o de usabilidad que no afecta seguridad, función obligatoria ni evidencia. Puede entregarse en punch list con corrección ≤20 días hábiles.

Después de una corrección se repite la prueba fallida y la regresión de todas las funciones que puedan verse afectadas. El Sponsor acepta comercialmente la entrega; el Senior Engineer avala el cierre técnico. Ninguno puede, por sí solo, dispensar una condición de seguridad.

### Repetibilidad para una expansión de hasta 10 unidades

Las pruebas deben ser repetibles y versionadas. Cada assembly crítico tendrá part number/revision, identificación trazable, firmware/configuration, calibración y pass/fail record. Los fixtures, scripts, arneses y desviaciones de la unidad se documentarán para que una siguiente fase pueda convertirlos en incoming inspection, subsystem test y end-of-line test.

---

## 12. Control del proyecto

### Cadencia

- Sprint planning: inicio de cada semana.
- Daily sync: 10–15 minutos.
- Revisión técnica/riesgos: mitad de semana.
- Demo y aceptación: fin de semana.
- Status package: viernes.
- Sponsor: gates, excepciones, contingencia y aceptación.

### Status semanal obligatorio

- Sprint goal y entregables aceptados.
- Milestones y ruta crítica.
- BoM revision, AC, committed, ETC, EAC y reserva.
- Supplier/long-lead status.
- Release maturity por subsistema.
- Top risks, hazards y defects P0/P1.
- Decisiones y cambios abiertos.
- Look-ahead de dos semanas.

### KPIs

| KPI | Verde | Amarillo | Rojo |
|---|---:|---:|---:|
| Variación milestone crítico | ≤2 días | 3–5 días | >5 días |
| Forecast hardware | ≤$49,739.85 | $49,739.86–$58,000 | >$58,000 |
| Reserva antes de W12 | ≥50% | 25–49% | <25% |
| Partes críticas a tiempo | ≥95% | 85–94% | <85% |
| Mandatory tests passed W14 | 100% | 95–99% con plan de cierre | <95% |
| P0 abiertos en cualquier release | 0 | N/A | ≥1 |
| P1 abiertos en release | 0 | 1 con disposición conjunta | >1 |
| Runtime a 200 W | ≥4.0 h | 3.8–3.99 h | <3.8 h |
| Swap | ≤5 min | 5–6 min | >6 min |
| Uncontrolled motion | 0 | N/A | Cualquier evento |

---

## 13. Control de cambios

| Clase | Condición | Aprobación |
|---|---|---|
| Class 1 | Sin costo externo, sin ruta crítica, interfaz o seguridad | PM |
| Class 2 | Costo ≤MXN $1,000 e impacto ≤2 días, sin reducción de seguridad, sin uso de contingencia y sin activar Class 3 | PM + Senior Engineer |
| Class 3 | Costo >MXN $1,000, uso de reserva, arquitectura, interfaz, seguridad o milestone | Sponsor |

Toda modificación de arquitectura después de Semana 2 y todo feature nuevo después de Semana 12 se consideran Class 3. Siempre aplica la clase más alta activada por cualquiera de las condiciones.

---

## 14. Cierre del proyecto

El proyecto se considera completo cuando:

1. La matriz final está 100% ejecutada, aprobada y firmada.
2. Todos los objetivos no dispensables pasan; sólo P1 no relacionados con seguridad pueden tener la disposición conjunta definida.
3. No existen defectos P0 abiertos.
4. Los P1 tienen disposición autorizada.
5. Compras, impuestos, facturas/tickets, reembolsos, contingencia y servicios están reconciliados contra el presupuesto aprobado.
6. Robot y accesorios acordados se entregaron.
7. CAD, BoM, source, binaries, configuration, calibrations, evidence, logs y manuales están archivados.
8. Se documentaron recomendaciones para la siguiente revisión y hasta 10 unidades.
9. El Sponsor firma aceptación y cierre.

---

## 15. Decisiones a congelar en SRR/PDR

1. Números de parte finales de BMS, IMU, cámaras y componentes auxiliares; Jetson, ESP32-S3, celdas, motorreductores y dos RPLIDAR S2 se adoptan de la propuesta vigente.
2. Responsabilidad exacta de diseño de PCB y contenido landed de la cotización.
3. Confirmación del target de respaldo de controles de 10 minutos.
4. Ratificación o Change Class 3 de los valores provisionales ACC-06 a ACC-10.
5. Tiempos/distancias de frenado, límites ambientales, superficie y circuito del Final Acceptance Test.
6. Masa máxima aceptada del assembly completo del acumulador.
7. Fallback por retraso o falla de primera revisión de PCB.

---

## 16. Autorización y firmas

La firma provisional aprueba el alcance, la matriz inicial, el presupuesto de hardware base de MXN $49,739.85, la contingencia Sponsor de MXN $7,460.98, el forecast de hardware de MXN $57,200.83, el techo propuesto de hardware de MXN $58,000, los servicios del Project Manager por MXN $160,000 y los servicios del Senior Engineer por MXN $160,000. Los servicios profesionales suman MXN $320,000 y el presupuesto total planeado suma MXN $377,200.83 antes de cargas fiscales aplicables. La Semana 1 y el calendario de 16 semanas sólo comienzan cuando el Sponsor emite el NTP/luz verde escrita. Los términos de facturación de cada servicio y demás condiciones comerciales se incorporarán al contrato futuro.

| Rol | Nombre | Decisión | Fecha | Firma |
|---|---|---|---|---|
| Sponsor | Luis Vazquez | Aprobar / Rechazar |  |  |
| Project Manager | Germán Velázquez | Aceptar responsabilidad |  |  |
| Senior Engineer | Sebastian Barrio | Avalar baseline técnico y de verificación |  |  |

---

**Documento controlado — RoboMop New Era — Project Charter v1.1 para aprobación provisional**
