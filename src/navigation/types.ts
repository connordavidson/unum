export type RootStackParamList = {
  Map: undefined;
  Camera: undefined;
  SignIn: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
