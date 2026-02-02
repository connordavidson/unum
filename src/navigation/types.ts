export type RootStackParamList = {
  Map: undefined;
  Camera: undefined;
  SignIn: undefined;
  PrivacyPolicy: undefined;
  TermsOfService: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
