export const layout = {
  tabBarHeight: 72,
  tabBarSideMargin: 12,
  tabBarBottomMargin: 0,
  tabBarGap: 12,
  screenPadding: 20,
  maxContentWidth: 560,
  maxWideWidth: 880,
  maxBoardWidth: 1240,
  sideBarWidth: 232,
  boardGap: 16,
} as const;

export const tabBarSpace =
  layout.tabBarHeight + layout.tabBarBottomMargin + layout.tabBarGap;
