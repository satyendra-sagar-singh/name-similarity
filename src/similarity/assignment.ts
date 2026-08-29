/**
 * Rectangular assignment (Hungarian / Kuhn-Munkres with potentials).
 *
 * Greedy token pairing is tempting and wrong: with `John James` vs
 * `James Johnson`, greedy locks `John`->`Johnson` first and then has nothing
 * good left for `James`. Optimal assignment maximises the total instead.
 */

/**
 * Minimise total cost. Returns, for each row, the assigned column or `-1`.
 *
 * @param cost dense matrix, `cost[row][column]`, all finite.
 */
export function solveAssignment(cost: readonly (readonly number[])[]): number[] {
  const rows = cost.length;
  if (rows === 0) return [];
  const columns = cost[0]!.length;
  if (columns === 0) return new Array<number>(rows).fill(-1);

  // The algorithm below requires rows <= columns; transpose when it does not.
  if (rows > columns) {
    const transposed: number[][] = Array.from({ length: columns }, (_, column) =>
      Array.from({ length: rows }, (_, row) => cost[row]![column]!),
    );
    const columnAssignment = solveAssignment(transposed);
    const rowAssignment = new Array<number>(rows).fill(-1);
    columnAssignment.forEach((row, column) => {
      if (row >= 0) rowAssignment[row] = column;
    });
    return rowAssignment;
  }

  const INF = Number.POSITIVE_INFINITY;
  const potentialRow = new Float64Array(rows + 1);
  const potentialColumn = new Float64Array(columns + 1);
  const columnToRow = new Int32Array(columns + 1).fill(0);
  const previousColumn = new Int32Array(columns + 1).fill(0);

  for (let row = 1; row <= rows; row++) {
    columnToRow[0] = row;
    let currentColumn = 0;
    const minimumDelta = new Float64Array(columns + 1).fill(INF);
    const visited = new Uint8Array(columns + 1);

    do {
      visited[currentColumn] = 1;
      const currentRow = columnToRow[currentColumn]!;
      let delta = INF;
      let nextColumn = 0;

      for (let column = 1; column <= columns; column++) {
        if (visited[column]) continue;
        const reduced =
          cost[currentRow - 1]![column - 1]! -
          potentialRow[currentRow]! -
          potentialColumn[column]!;
        if (reduced < minimumDelta[column]!) {
          minimumDelta[column] = reduced;
          previousColumn[column] = currentColumn;
        }
        if (minimumDelta[column]! < delta) {
          delta = minimumDelta[column]!;
          nextColumn = column;
        }
      }

      for (let column = 0; column <= columns; column++) {
        if (visited[column]) {
          const assignedRow = columnToRow[column]!;
          potentialRow[assignedRow] = potentialRow[assignedRow]! + delta;
          potentialColumn[column] = potentialColumn[column]! - delta;
        } else {
          minimumDelta[column] = minimumDelta[column]! - delta;
        }
      }

      currentColumn = nextColumn;
    } while (columnToRow[currentColumn] !== 0);

    do {
      const previous = previousColumn[currentColumn]!;
      columnToRow[currentColumn] = columnToRow[previous]!;
      currentColumn = previous;
    } while (currentColumn !== 0);
  }

  const assignment = new Array<number>(rows).fill(-1);
  for (let column = 1; column <= columns; column++) {
    const row = columnToRow[column]!;
    if (row > 0) assignment[row - 1] = column - 1;
  }
  return assignment;
}

/**
 * Maximise total similarity. Convenience wrapper over {@link solveAssignment}.
 *
 * @param similarity `similarity[row][column]` in `0..1`.
 */
export function solveMaxAssignment(
  similarity: readonly (readonly number[])[],
): number[] {
  const cost = similarity.map((row) => row.map((value) => 1 - value));
  return solveAssignment(cost);
}
