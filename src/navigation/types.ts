export type RootStackParamList = {
  Map: undefined;
  Camera: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
