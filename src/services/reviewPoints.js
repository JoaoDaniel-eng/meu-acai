// Ponto por avaliação aprovada: vale uma única vez por cliente (não por avaliação).
// A conta é reconhecida pelo telefone só com dígitos, o mesmo critério do saldo de pontos.
export const REVIEW_POINT_ALREADY_GIVEN_SQL = `EXISTS (
  SELECT 1 FROM loyalty_points lp JOIN customers c ON c.id=$1
  WHERE lp.source='review' AND regexp_replace(lp.customer_phone,'[^0-9]','','g')=regexp_replace(c.phone,'[^0-9]','','g'))`;
export async function customerHasReviewPoint(db, customerId) {
  if (!customerId)
    return false;
  const r = await db.query(`SELECT ${REVIEW_POINT_ALREADY_GIVEN_SQL} AS given`, [customerId]);
  return Boolean(r.rows[0]?.given);
}
