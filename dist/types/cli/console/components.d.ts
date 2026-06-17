import { type Component } from '@earendil-works/pi-tui';
import type { RuntimeClient } from './types.js';
interface ConsoleAppOptions {
    runtime: RuntimeClient;
    requestRender: () => void;
    stop: () => void;
    rows: () => number;
}
export declare class ConsoleApp implements Component {
    private readonly options;
    private state;
    private timer;
    private refreshInFlight;
    private disposed;
    private renderedDetailRows;
    private lastWidth;
    constructor(options: ConsoleAppOptions);
    start(): Promise<void>;
    stop(): void;
    invalidate(): void;
    handleInput(data: string): void;
    render(width: number): string[];
    private loadRepos;
    private refresh;
    private dispatch;
    private refreshAfter;
    private open;
    private back;
    private renderMain;
    private renderProcessRows;
    private renderFeedRows;
    private renderJobRows;
    private renderResultRows;
    private feedLines;
    private headerLine;
    private detailJobLabel;
    private findSelectedJob;
    private statsLine;
    private keysLine;
    private mainViewportRows;
}
export declare function fitFrame(lines: string[], width: number, height: number): string[];
export {};
//# sourceMappingURL=components.d.ts.map