// UI half of the instrument registry (the domain half is domain/instruments.ts).
// A guitar later = a GuitarDiagram here + a 'guitar' entry there.
import type { ComponentType } from 'react';
import type { InstrumentId } from '../../domain/instruments';
import { Keyboard, type KeyboardProps } from '../../ui/Keyboard';

export type DiagramProps = KeyboardProps;
export const diagrams: Record<InstrumentId, ComponentType<DiagramProps>> = { piano: Keyboard };
