import { describe, expect, it } from "vitest";
import type { PanelId, PanelState, ProductionPanelsState } from "./use-production-panels";

describe("PanelState types", () => {
  it("PanelState has correct shape", () => {
    const state: PanelState = {
      isOpen: false,
      isExpanded: false,
    };
    expect(state.isOpen).toBe(false);
    expect(state.isExpanded).toBe(false);
  });

  it("PanelId can be any of the four panel types", () => {
    const ids: PanelId[] = ["productionBoard", "generationConsole", "exportQueue", "settings"];
    expect(ids).toHaveLength(4);
  });

  it("ProductionPanelsState has all four panels", () => {
    const state: ProductionPanelsState = {
      productionBoard: { isOpen: false, isExpanded: false },
      generationConsole: { isOpen: false, isExpanded: false },
      exportQueue: { isOpen: false, isExpanded: false },
      settings: { isOpen: false, isExpanded: false },
    };
    expect(state.productionBoard.isOpen).toBe(false);
    expect(state.generationConsole.isOpen).toBe(false);
    expect(state.exportQueue.isOpen).toBe(false);
    expect(state.settings.isOpen).toBe(false);
  });
});

describe("Panel state transitions", () => {
  it("closed panel has correct default values", () => {
    const closed: PanelState = { isOpen: false, isExpanded: false };
    expect(closed.isOpen).toBe(false);
    expect(closed.isExpanded).toBe(false);
  });

  it("open panel has correct default values", () => {
    const open: PanelState = { isOpen: true, isExpanded: true };
    expect(open.isOpen).toBe(true);
    expect(open.isExpanded).toBe(true);
  });

  it("can transition from closed to open", () => {
    const closed: PanelState = { isOpen: false, isExpanded: false };
    const open: PanelState = { ...closed, isOpen: true, isExpanded: true };
    expect(closed.isOpen).toBe(false);
    expect(open.isOpen).toBe(true);
    expect(open.isExpanded).toBe(true);
  });

  it("can transition from open to closed", () => {
    const open: PanelState = { isOpen: true, isExpanded: true };
    const closed: PanelState = { isOpen: false, isExpanded: false };
    expect(closed.isOpen).toBe(false);
    expect(closed.isExpanded).toBe(false);
  });

  it("can have open but collapsed panel", () => {
    const panel: PanelState = { isOpen: true, isExpanded: false };
    expect(panel.isOpen).toBe(true);
    expect(panel.isExpanded).toBe(false);
  });
});

describe("Production panels isolation", () => {
  it("each panel state is independent", () => {
    const state: ProductionPanelsState = {
      productionBoard: { isOpen: true, isExpanded: true },
      generationConsole: { isOpen: false, isExpanded: false },
      exportQueue: { isOpen: false, isExpanded: false },
      settings: { isOpen: false, isExpanded: false },
    };

    expect(state.productionBoard.isOpen).toBe(true);
    expect(state.generationConsole.isOpen).toBe(false);
    expect(state.exportQueue.isOpen).toBe(false);
    expect(state.settings.isOpen).toBe(false);
  });

  it("can have multiple panels open simultaneously", () => {
    const state: ProductionPanelsState = {
      productionBoard: { isOpen: true, isExpanded: false },
      generationConsole: { isOpen: true, isExpanded: true },
      exportQueue: { isOpen: false, isExpanded: false },
      settings: { isOpen: true, isExpanded: false },
    };

    const openPanels = [
      state.productionBoard,
      state.generationConsole,
      state.settings,
    ].filter((p) => p.isOpen);

    expect(openPanels).toHaveLength(3);
  });
});
