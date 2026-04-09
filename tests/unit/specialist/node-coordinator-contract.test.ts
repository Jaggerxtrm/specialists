import { readFileSync } from 'node:fs';
import { buildCoordinatorOutputJsonSchema } from '../../../src/specialist/node-contract.js';

describe('node coordinator config contract', () => {
  it('config output schema declares constrained autonomy actions and phases', () => {
    const raw = readFileSync('config/specialists/node-coordinator.specialist.json', 'utf8');
    const config = JSON.parse(raw);
    const schema = config.specialist.prompt.output_schema;

    expect(schema.required).toEqual(['summary', 'node_status', 'phases', 'memory_patch', 'actions', 'validation']);
    expect(schema.properties.node_status.enum).toEqual(['in_progress', 'complete', 'blocked', 'aborted']);
    expect(schema.properties.phases.items.properties.phase_kind.enum).toEqual([
      'explore',
      'design',
      'impl',
      'review',
      'fix',
      're_review',
      'custom',
    ]);

    const actionTypes = (schema.properties.actions.items.oneOf as Array<any>)
      .flatMap((variant) => variant.properties.type.enum)
      .sort();
    expect(actionTypes).toEqual(['complete_node', 'create_bead']);

    const { ['x-schema-source']: _schemaSource, ...runtimeSchema } = schema;
    expect(runtimeSchema).toEqual(buildCoordinatorOutputJsonSchema());
  });
});
